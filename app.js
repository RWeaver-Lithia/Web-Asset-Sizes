const PAGE_SIZE = 80;

const state = {
    records: [],
    user: null,
    scope: "all",
    visibleCount: PAGE_SIZE,
};

const elements = {
    search: document.querySelector("#search"),
    brand: document.querySelector("#brand-filter"),
    provider: document.querySelector("#provider-filter"),
    asset: document.querySelector("#asset-filter"),
    device: document.querySelector("#device-filter"),
    results: document.querySelector("#results"),
    resultCount: document.querySelector("#result-count"),
    totalSpecs: document.querySelector("#total-specs"),
    loadMore: document.querySelector("#load-more"),
    dataStatus: document.querySelector("#data-status"),
    addSpec: document.querySelector("#add-spec"),
    dialog: document.querySelector("#spec-dialog"),
    form: document.querySelector("#spec-form"),
    formError: document.querySelector("#form-error"),
    recordType: document.querySelector("#form-record-type"),
    dialogTitle: document.querySelector("#dialog-title"),
};

function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (character) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
    })[character]);
}

function uniqueValues(key) {
    return [...new Set(state.records.map((record) => record[key]).filter(Boolean))]
        .sort((left, right) => left.localeCompare(right));
}

function populateSelect(select, values, placeholder) {
    select.replaceChildren(new Option(placeholder, ""));
    for (const value of values) {
        select.add(new Option(value, value));
    }
}

function currentResults() {
    const query = elements.search.value.trim().toLocaleLowerCase();
    return state.records.filter((record) => {
        if (state.scope !== "all" && record.recordType !== state.scope) return false;
        if (elements.brand.value && record.brand !== elements.brand.value) return false;
        if (elements.provider.value && record.provider !== elements.provider.value) return false;
        if (elements.asset.value && record.assetType !== elements.asset.value) return false;
        if (elements.device.value === "mobile" && !record.assetType.toLocaleLowerCase().includes("mobile")) return false;
        if (elements.device.value === "desktop" && record.assetType.toLocaleLowerCase().includes("mobile")) return false;
        if (!query) return true;
        const searchable = [
            record.brand, record.brandCode, record.store, record.storeCode,
            record.provider, record.assetType, record.size, record.notes, record.state,
        ].join(" ").toLocaleLowerCase();
        return searchable.includes(query);
    }).sort((left, right) => {
        const brandOrder = left.brand.localeCompare(right.brand);
        if (brandOrder) return brandOrder;
        const scopeOrder = left.recordType.localeCompare(right.recordType);
        if (scopeOrder) return scopeOrder;
        const assetOrder = left.assetType.localeCompare(right.assetType);
        if (assetOrder) return assetOrder;
        return left.store.localeCompare(right.store);
    });
}

function resultRow(record) {
    const isStore = record.recordType === "store";
    const appliesTo = isStore ? record.store : "Brand/provider standard";
    const detail = isStore ? [record.storeCode, record.state].filter(Boolean).join(" · ") : record.provider;
    const note = record.notes ? `<span class="note-line">${escapeHtml(record.notes)}</span>` : "";
    const scope = isStore ? "Store-specific" : "Standard";
    const scopeClass = isStore ? "" : " standard";
    const editButton = state.user?.isAdmin && record.id
        ? `<button class="edit-spec" type="button" data-edit-id="${escapeHtml(record.id)}">Edit</button>`
        : "";

    return `<article class="spec-row" role="row">
        <div role="cell"><span class="brand-name">${escapeHtml(record.brand)}</span><span class="brand-code">${escapeHtml(record.brandCode)}</span></div>
        <div role="cell"><span class="placement-name">${escapeHtml(record.assetType)}</span></div>
        <div role="cell"><span class="dimension-value">${escapeHtml(record.size)}</span></div>
        <div role="cell"><span class="provider-name">${escapeHtml(record.provider)}</span></div>
        <div role="cell"><span class="applies-name">${escapeHtml(appliesTo)}</span><span class="applies-detail">${escapeHtml(detail)}</span><span class="scope-tag${scopeClass}">${scope}</span>${note}${editButton}</div>
    </article>`;
}

function render() {
    const filtered = currentResults();
    const shown = filtered.slice(0, state.visibleCount);
    elements.resultCount.textContent = `${filtered.length.toLocaleString()} matching ${filtered.length === 1 ? "specification" : "specifications"}`;
    elements.results.setAttribute("aria-busy", "false");
    elements.addSpec.hidden = !state.user?.isAdmin;
    elements.results.innerHTML = shown.length
        ? shown.map(resultRow).join("")
        : '<div class="empty-state">No matching specifications. Try a broader search or clear a filter.</div>';
    elements.loadMore.hidden = shown.length >= filtered.length;
    elements.totalSpecs.textContent = state.records.length.toLocaleString();
}

function resetAndRender() {
    state.visibleCount = PAGE_SIZE;
    render();
}

async function loadRecords() {
    try {
        const response = await fetch("/api/specs", { headers: { Accept: "application/json" } });
        if (response.ok) {
            const payload = await response.json();
            state.records = Array.isArray(payload) ? payload : payload.specs;
            state.user = Array.isArray(payload) ? null : payload.user;
            elements.dataStatus.textContent = state.user?.isAdmin ? "LIVE CATALOG · ADMIN" : "LIVE CATALOG";
        } else {
            throw new Error("Catalog API unavailable");
        }
    } catch {
        const response = await fetch("/data/asset-specs.json");
        if (!response.ok) throw new Error("Could not load the workbook export.");
        state.records = await response.json();
        state.user = null;
        elements.dataStatus.textContent = "WORKBOOK IMPORT · READ ONLY";
    }

    populateSelect(elements.brand, uniqueValues("brand"), "All brands");
    populateSelect(elements.provider, uniqueValues("provider"), "All providers");
    populateSelect(elements.asset, uniqueValues("assetType"), "All placements");
    const assetTypeOptions = document.querySelector("#asset-type-options");
    assetTypeOptions.replaceChildren(...uniqueValues("assetType").map((value) => new Option(value, value)));
    render();
}

function openEditor(record = null) {
    elements.form.reset();
    elements.formError.hidden = true;
    elements.formError.textContent = "";
    elements.dialogTitle.textContent = record ? "Edit specification" : "Add specification";
    for (const field of elements.form.elements) {
        if (field.name && record && Object.hasOwn(record, field.name)) {
            field.value = record[field.name];
        }
    }
    elements.recordType.value = record?.recordType || "store";
    updateStoreFields();
    elements.dialog.showModal();
    elements.form.elements.namedItem("provider").focus();
}

function updateStoreFields() {
    const isStore = elements.recordType.value === "store";
    document.querySelectorAll(".store-field").forEach((field) => {
        field.hidden = !isStore;
        const input = field.querySelector("input");
        if (input.name === "store") input.required = isStore;
    });
}

async function saveSpecification(event) {
    event.preventDefault();
    const formData = new FormData(elements.form);
    const id = formData.get("id");
    const payload = Object.fromEntries(formData.entries());
    delete payload.id;

    try {
        const response = await fetch(id ? `/api/specs/${encodeURIComponent(id)}` : "/api/specs", {
            method: id ? "PUT" : "POST",
            headers: { "Content-Type": "application/json", Accept: "application/json" },
            body: JSON.stringify(payload),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Could not save this specification.");
        elements.dialog.close();
        await loadRecords();
    } catch (error) {
        elements.formError.textContent = error.message || "Could not save this specification.";
        elements.formError.hidden = false;
    }
}

elements.search.addEventListener("input", resetAndRender);
for (const select of [elements.brand, elements.provider, elements.asset, elements.device]) {
    select.addEventListener("change", resetAndRender);
}

document.querySelectorAll(".scope-button").forEach((button) => {
    button.addEventListener("click", () => {
        state.scope = button.dataset.scope;
        document.querySelectorAll(".scope-button").forEach((scopeButton) => {
            const selected = scopeButton === button;
            scopeButton.classList.toggle("is-active", selected);
            scopeButton.setAttribute("aria-pressed", String(selected));
        });
        resetAndRender();
    });
});

document.querySelector("#clear-filters").addEventListener("click", () => {
    elements.search.value = "";
    elements.brand.value = "";
    elements.provider.value = "";
    elements.asset.value = "";
    elements.device.value = "";
    state.scope = "all";
    document.querySelectorAll(".scope-button").forEach((button) => {
        const selected = button.dataset.scope === "all";
        button.classList.toggle("is-active", selected);
        button.setAttribute("aria-pressed", String(selected));
    });
    resetAndRender();
});

elements.loadMore.addEventListener("click", () => {
    state.visibleCount += PAGE_SIZE;
    render();
});

elements.addSpec.addEventListener("click", () => openEditor());
elements.results.addEventListener("click", (event) => {
    const button = event.target.closest("[data-edit-id]");
    if (!button) return;
    const record = state.records.find((item) => String(item.id) === button.dataset.editId);
    if (record) openEditor(record);
});
elements.recordType.addEventListener("change", updateStoreFields);
elements.form.addEventListener("submit", saveSpecification);
document.querySelector("#close-dialog").addEventListener("click", () => elements.dialog.close());
document.querySelector("#cancel-dialog").addEventListener("click", () => elements.dialog.close());

document.addEventListener("keydown", (event) => {
    if (event.key === "/" && !["INPUT", "SELECT", "TEXTAREA"].includes(document.activeElement.tagName)) {
        event.preventDefault();
        elements.search.focus();
    }
});

loadRecords().catch(() => {
    elements.resultCount.textContent = "Catalog unavailable";
    elements.dataStatus.textContent = "DATA NOT LOADED";
    elements.results.setAttribute("aria-busy", "false");
    elements.results.innerHTML = '<div class="empty-state">The asset library could not be loaded. Check the data export and try again.</div>';
});