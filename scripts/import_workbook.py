import argparse
import json
import re
import zipfile
from pathlib import Path
from xml.etree import ElementTree


MAIN_NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
ASSET_COLUMNS = {
    "G": "Homepage Slider",
    "H": "Homepage Slider (SafeSpace)",
    "I": "Homepage Slider - Mobile",
    "J": "Leaderboard Tile",
    "K": "Leaderboard Tile - Mobile",
    "L": "Banners",
    "M": "Alert Banners",
    "N": "Banners - Mobile",
}
STANDARD_COLUMNS = {
    "S": "Homepage Slider",
    "T": "Homepage Slider (SafeSpace)",
    "U": "Homepage Slider - Mobile",
    "V": "Leaderboard Tile",
    "W": "Leaderboard Tile - Mobile",
    "X": "Banners",
    "Y": "Alert Banners",
    "Z": "Banners - Mobile",
}


def column_name(cell_reference):
    return re.match(r"[A-Z]+", cell_reference).group(0)


def cell_value(cell, shared_strings):
    value = cell.find(f"{{{MAIN_NS}}}v")
    if cell.attrib.get("t") == "inlineStr":
        return "".join(node.text or "" for node in cell.iter(f"{{{MAIN_NS}}}t"))
    if value is None or value.text is None:
        return ""
    if cell.attrib.get("t") == "s":
        return shared_strings[int(value.text)]
    return value.text


def read_sheet(archive, path, shared_strings):
    root = ElementTree.fromstring(archive.read(path))
    rows = {}
    for row in root.findall(f".//{{{MAIN_NS}}}sheetData/{{{MAIN_NS}}}row"):
        values = {}
        for cell in row.findall(f"{{{MAIN_NS}}}c"):
            value = cell_value(cell, shared_strings)
            if value != "":
                values[column_name(cell.attrib["r"])] = value
        rows[int(row.attrib["r"])] = values
    return rows


def workbook_sheets(archive):
    workbook = ElementTree.fromstring(archive.read("xl/workbook.xml"))
    relationships = ElementTree.fromstring(archive.read("xl/_rels/workbook.xml.rels"))
    targets = {node.attrib["Id"]: node.attrib["Target"] for node in relationships}
    sheets = []
    for sheet in workbook.find(f"{{{MAIN_NS}}}sheets"):
        target = targets[sheet.attrib[f"{{{REL_NS}}}id"]].lstrip("/")
        if not target.startswith("xl/"):
            target = f"xl/{target}"
        sheets.append((sheet.attrib["name"], target))
    return sheets


def build_records(workbook_path):
    with zipfile.ZipFile(workbook_path) as archive:
        shared_strings = []
        if "xl/sharedStrings.xml" in archive.namelist():
            root = ElementTree.fromstring(archive.read("xl/sharedStrings.xml"))
            shared_strings = [
                "".join(node.text or "" for node in item.iter(f"{{{MAIN_NS}}}t"))
                for item in root
            ]

        sheets = workbook_sheets(archive)
        brand_names = {}
        for name, path in sheets:
            if name == "Web Asset Sizes - IRC ONLY":
                continue
            rows = read_sheet(archive, path, shared_strings)
            identity = rows.get(2, {})
            code = identity.get("B")
            label = identity.get("E") or name
            if code and code not in {"Group", "Table Usage"}:
                brand_names[code] = label

        master_path = next(
            path for name, path in sheets if name == "Web Asset Sizes - IRC ONLY"
        )
        master_rows = read_sheet(archive, master_path, shared_strings)

    records = []
    for row_number, row in master_rows.items():
        if row_number < 6:
            continue

        brand_code = row.get("B")
        store_name = row.get("E")
        provider = row.get("F")
        if brand_code and store_name and provider:
            for column, asset_type in ASSET_COLUMNS.items():
                size = row.get(column)
                if size is not None:
                    records.append(
                        {
                            "recordType": "store",
                            "brandCode": brand_code,
                            "brand": brand_names.get(brand_code, brand_code),
                            "state": row.get("C", ""),
                            "storeCode": row.get("D", ""),
                            "store": store_name,
                            "provider": provider,
                            "assetType": asset_type,
                            "size": size,
                            "notes": row.get("O", ""),
                        }
                    )

        standard_brand = row.get("Q")
        standard_provider = row.get("R")
        if standard_brand and standard_provider:
            for column, asset_type in STANDARD_COLUMNS.items():
                size = row.get(column)
                if size is not None:
                    records.append(
                        {
                            "recordType": "standard",
                            "brandCode": standard_brand,
                            "brand": brand_names.get(standard_brand, standard_brand),
                            "state": "",
                            "storeCode": "",
                            "store": "",
                            "provider": standard_provider,
                            "assetType": asset_type,
                            "size": size,
                            "notes": "",
                        }
                    )

    return records


def main():
    parser = argparse.ArgumentParser(
        description="Export the consolidated asset-size tables from the workbook."
    )
    parser.add_argument(
        "--workbook", type=Path, default=Path("Web Asset Sizes.xlsx")
    )
    parser.add_argument(
        "--output", type=Path, default=Path("data/asset-specs.json")
    )
    parser.add_argument("--sql-output", type=Path, default=Path("data/seed.sql"))
    args = parser.parse_args()

    records = build_records(args.workbook)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(
        json.dumps(records, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    sql_columns = (
        "record_type, brand_code, brand, state, store_code, store_name, "
        "website_provider, asset_type, size, notes"
    )
    statements = [
        "INSERT INTO asset_specs ({}) VALUES ({});".format(
            sql_columns,
            ", ".join(
                "'{}'".format(record[key].replace("'", "''"))
                for key in (
                    "recordType",
                    "brandCode",
                    "brand",
                    "state",
                    "storeCode",
                    "store",
                    "provider",
                    "assetType",
                    "size",
                    "notes",
                )
            ),
        )
        for record in records
    ]
    args.sql_output.parent.mkdir(parents=True, exist_ok=True)
    args.sql_output.write_text("\n".join(statements) + "\n", encoding="utf-8")
    store_count = sum(record["recordType"] == "store" for record in records)
    standard_count = len(records) - store_count
    print(
        f"Wrote {len(records)} specs ({store_count} store-specific, "
        f"{standard_count} brand/provider standards) to {args.output} "
        f"and {args.sql_output}"
    )


if __name__ == "__main__":
    main()