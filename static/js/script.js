// --- Application State Management ---

// This object holds all the data, similar to st.session_state
const appState = {
    cmd_names: ["SP", "DySP", "IP"],
    force_names: ["SI/ASI", "SCPO/CPO", "WSCPO/WCPO"],
    scheme_data: [],
    nom_data: [],
    theme: "Default Blue",
    scheme_undo: [],
    scheme_redo: [],
    nom_undo: [],
    nom_redo: [],
    colWidths: {},
    scheme_heading: "",
    scheme_date: ""
};

function getSchemeHeaders() {
    return ["Zone", "Division", "Sector", "Point", ...appState.cmd_names, ...appState.force_names];
}

function initializeState() {
    // Create an empty scheme dataframe to start with
    const headers = getSchemeHeaders();
    const emptyData = Array(20).fill(null).map(() => 
        headers.reduce((acc, header) => ({ ...acc, [header]: "" }), { Select: false })
    );
    appState.scheme_data = emptyData;
}

// --- Blob File Downloader ---
async function downloadBlob(endpoint, payload, filename) {
    try {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (!response.ok) throw new Error('Network response was not ok');
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
    } catch(err) {
        console.error('Download failed:', err);
        alert('Failed to download file. Ensure the backend is running.');
    }
}

// --- UI Rendering Functions ---

function makeTableResizable(table) {
    if (!table) return;
    const cols = table.querySelectorAll('thead th');
    cols.forEach(col => {
        // Restore previously adjusted width for this column name
        const colName = col.innerText.trim();
        if (colName && appState.colWidths[colName]) {
            const w = appState.colWidths[colName];
            col.style.width = `${w}px`;
            col.style.minWidth = `${w}px`;
            col.style.maxWidth = `${w}px`;
        }

        if (col.querySelector('.resizer')) return;

        const resizer = document.createElement('div');
        resizer.classList.add('resizer');
        
        resizer.style.width = '8px';
        resizer.style.height = '100%';
        resizer.style.position = 'absolute';
        resizer.style.right = '0';
        resizer.style.top = '0';
        resizer.style.cursor = 'col-resize';
        resizer.style.userSelect = 'none';
        resizer.style.zIndex = '1';
        
        resizer.addEventListener('mouseenter', () => resizer.style.backgroundColor = 'rgba(0,0,0,0.1)');
        resizer.addEventListener('mouseleave', () => resizer.style.backgroundColor = 'transparent');

        col.style.position = 'relative';
        col.appendChild(resizer);

        let startX, startWidth;
        resizer.addEventListener('mousedown', function (e) {
            startX = e.clientX;
            startWidth = col.offsetWidth;
            resizer.style.backgroundColor = '#007bff';
                document.body.style.userSelect = 'none'; // Prevent text selection highlight while dragging

            const mouseMoveHandler = function (e) {
                    const newWidth = Math.max(30, startWidth + (e.clientX - startX));
                col.style.width = `${newWidth}px`;
                col.style.minWidth = `${newWidth}px`;
                    col.style.maxWidth = `${newWidth}px`;
                if (colName) appState.colWidths[colName] = newWidth; // Remember width
            };
            const mouseUpHandler = function () {
                resizer.style.backgroundColor = 'transparent';
                    document.body.style.userSelect = '';
                document.removeEventListener('mousemove', mouseMoveHandler);
                document.removeEventListener('mouseup', mouseUpHandler);
            };
            document.addEventListener('mousemove', mouseMoveHandler);
            document.addEventListener('mouseup', mouseUpHandler);
                e.stopPropagation();
            e.preventDefault();
        });
    });
}

function renderSchemeTable() {
    const container = document.getElementById('scheme-editor-container');
    if (!container) return;

    const headers = getSchemeHeaders();
    let table = '<div class="table-container"><table class="data-grid">';
    
    // Header Row
    table += '<thead><tr><th>Select</th>';
    headers.forEach(h => table += `<th>${h}</th>`);
    table += '</tr></thead>';

    // Data Rows
    table += '<tbody>';
    appState.scheme_data.forEach((row, index) => {
        table += '<tr>';
        const isChecked = row.Select ? 'checked' : '';
        table += `<td style="text-align: center;"><input type="checkbox" class="row-select-checkbox" data-row="${index}" ${isChecked}></td>`;
        headers.forEach(header => {
            table += `<td contenteditable="true" data-row="${index}" data-col="${header}">${row[header] || ''}</td>`;
        });
        table += '</tr>';
    });
    table += '</tbody></table></div>';

    container.innerHTML = table;
    makeTableResizable(container.querySelector('table'));

    // Checkbox bindings
    container.querySelectorAll('.row-select-checkbox').forEach(chk => {
        chk.addEventListener('change', function() {
            appState.scheme_data[this.getAttribute('data-row')].Select = this.checked;
        });
    });

    // Content Editable bindings
    container.querySelectorAll('td[contenteditable="true"]').forEach(cell => {
        cell.addEventListener('blur', function() {
            const rowIndex = this.getAttribute('data-row');
            const colName = this.getAttribute('data-col');
            appState.scheme_data[rowIndex][colName] = this.innerText.trim();
        });
    });
}

const THEME_COLORS = {
    "Default Blue": {"z": "#1f497d", "d": "#4f81bd", "s": "#dce6f1", "gt": "#d4edda", "zf": "#ffffff", "df": "#ffffff", "sf": "#000000"},
    "Night Mode": {"z": "#121212", "d": "#2d2d2d", "s": "#404040", "gt": "#004d40", "zf": "#ffffff", "df": "#eeeeee", "sf": "#dddddd"},
    "Desert Sand": {"z": "#5d4037", "d": "#8d6e63", "s": "#d7ccc8", "gt": "#c8e6c9", "zf": "#ffffff", "df": "#ffffff", "sf": "#000000"},
    "Oceanic": {"z": "#004d40", "d": "#00838f", "s": "#b2ebf2", "gt": "#a5d6a7", "zf": "#ffffff", "df": "#ffffff", "sf": "#000000"},
    "High Contrast": {"z": "#000000", "d": "#333333", "s": "#cccccc", "gt": "#ffff00", "zf": "#ffffff", "df": "#ffffff", "sf": "#000000"},
    "Forest Green": {"z": "#1b5e20", "d": "#2e7d32", "s": "#c8e6c9", "gt": "#a5d6a7", "zf": "#ffffff", "df": "#ffffff", "sf": "#000000"},
    "Sunset Orange": {"z": "#e65100", "d": "#ef6c00", "s": "#ffe0b2", "gt": "#ffcc80", "zf": "#ffffff", "df": "#ffffff", "sf": "#000000"},
    "Royal Purple": {"z": "#4a148c", "d": "#6a1b9a", "s": "#e1bee7", "gt": "#ce93d8", "zf": "#ffffff", "df": "#ffffff", "sf": "#000000"},
    "Crimson Red": {"z": "#b71c1c", "d": "#c62828", "s": "#ffcdd2", "gt": "#ef9a9a", "zf": "#ffffff", "df": "#ffffff", "sf": "#000000"},
    "Steel Slate": {"z": "#263238", "d": "#455a64", "s": "#cfd8dc", "gt": "#b0bec5", "zf": "#ffffff", "df": "#ffffff", "sf": "#000000"},
    "Cyberpunk Neon": {"z": "#0d0221", "d": "#240046", "s": "#ff007f", "gt": "#00f0ff", "zf": "#00f0ff", "df": "#ff007f", "sf": "#ffffff"}
};

function getContrastingText(hex) {
    if (!hex) return "black";
    let h = String(hex).replace('#', '');
    if (h.length < 6) return "black";
    let r = parseInt(h.substring(0, 2), 16);
    let g = parseInt(h.substring(2, 4), 16);
    let b = parseInt(h.substring(4, 6), 16);
    let luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance > 0.5 ? "black" : "white";
}

function renderManpowerTotals(totalsData) {
    const container = document.getElementById('manpower-totals-container');
    if (!container || !totalsData || totalsData.length === 0) {
        container.innerHTML = "<p>No data to display. Generate the report first.</p>";
        return;
    }

    const activeTheme = THEME_COLORS[appState.theme] || THEME_COLORS["Default Blue"];
    const headers = ["Level", "Name", ...appState.cmd_names, ...appState.force_names];

    let table = '<div class="table-container"><table class="data-grid">';
    table += '<thead><tr>';
    headers.forEach(h => table += `<th>${h}</th>`);
    table += '</tr></thead><tbody>';

    totalsData.forEach(row => {
        let bg = "", fg = "#1e293b", weight = "normal";
        
        if (row.Level === "SCHEME TOTAL") {
            bg = activeTheme.gt; fg = getContrastingText(bg); weight = "bold";
        } else if (row.Level === "ZONE") {
            bg = activeTheme.z; fg = activeTheme.zf; weight = "bold";
        } else if (row.Level === "  ↳ DIVISION") {
            bg = activeTheme.d; fg = activeTheme.df; weight = "bold";
        } else if (row.Level === "      ↳ SECTOR") {
            bg = activeTheme.s; fg = activeTheme.sf; weight = "bold";
        }

        table += '<tr>';
        headers.forEach(header => {
            table += `<td style="background-color: ${bg}; color: ${fg}; font-weight: ${weight}; border-bottom: 1px solid #e2e8f0;">${row[header] || ''}</td>`;
        });
        table += '</tr>';
    });
    table += '</tbody></table></div>';
    container.innerHTML = table;
    makeTableResizable(container.querySelector('table'));
}

// --- API Interaction ---
async function alignScheme() {
    console.log("Sending scheme to backend for alignment...");
    try {
        const response = await fetch('/api/align-scheme', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ scheme_data: appState.scheme_data })
        });
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        
        appState.scheme_data = await response.json();
        renderSchemeTable(); 
        alert("Scheme aligned successfully!");
    } catch (error) {
        alert("Error: Could not align scheme. Check console for details.");
    }
}

function getManpowerTotals() {
    try {
        const allForceCols = [...appState.cmd_names, ...appState.force_names];
        const numCols = allForceCols.length;
        
        const grandTotal = Array(numCols).fill(0);
        const zoneTotals = new Map();
        const divTotals = new Map();
        const secTotals = new Map();
        
        let last_z = "", last_d = "", last_s = "";
        const orderedZones = [];
        const orderedDivs = {}; 
        const orderedSecs = {}; 
        
        appState.scheme_data.forEach(row => {
            let z = (row.Zone || "").trim();
            let d = (row.Division || "").trim();
            let s = (row.Sector || "").trim();
            
            if (z) { last_z = z; last_d = ""; last_s = ""; } else { z = last_z; }
            if (d) { last_d = d; last_s = ""; } else { d = last_d; }
            if (s) { last_s = s; } else { s = last_s; }
            
            if (!z && !d && !s) return;
            
            const z_key = z ? z : "UNZONED";
            const forces = allForceCols.map(col => parseInt(row[col] || '0', 10) || 0);
            
            if (!zoneTotals.has(z_key)) {
                zoneTotals.set(z_key, Array(numCols).fill(0));
                orderedZones.push(z_key);
            }
            if (d && !divTotals.has(`${z_key}|${d}`)) {
                divTotals.set(`${z_key}|${d}`, Array(numCols).fill(0));
                if (!orderedDivs[z_key]) orderedDivs[z_key] = [];
                orderedDivs[z_key].push(d);
            }
            if (s && !secTotals.has(`${z_key}|${d}|${s}`)) {
                secTotals.set(`${z_key}|${d}|${s}`, Array(numCols).fill(0));
                if (!orderedSecs[`${z_key}|${d}`]) orderedSecs[`${z_key}|${d}`] = [];
                orderedSecs[`${z_key}|${d}`].push(s);
            }
            
            for (let i = 0; i < numCols; i++) {
                grandTotal[i] += forces[i];
                zoneTotals.get(z_key)[i] += forces[i];
                if (d) divTotals.get(`${z_key}|${d}`)[i] += forces[i];
                if (s) secTotals.get(`${z_key}|${d}|${s}`)[i] += forces[i];
            }
        });
        
        const totalsData = [];
        const createRow = (level, name, totalsArr) => {
            const r = { Level: level, Name: name };
            allForceCols.forEach((col, idx) => r[col] = totalsArr[idx]);
            return r;
        };
        
        orderedZones.forEach(z_key => {
            if (orderedDivs[z_key]) {
                orderedDivs[z_key].forEach(d_key => {
                    if (orderedSecs[`${z_key}|${d_key}`]) {
                        orderedSecs[`${z_key}|${d_key}`].forEach(s_key => {
                            totalsData.push(createRow("      ↳ SECTOR", s_key, secTotals.get(`${z_key}|${d_key}|${s_key}`)));
                        });
                    }
                    totalsData.push(createRow("  ↳ DIVISION", d_key, divTotals.get(`${z_key}|${d_key}`)));
                });
            }
            totalsData.push(createRow("ZONE", z_key, zoneTotals.get(z_key)));
        });
        
        totalsData.push(createRow("SCHEME TOTAL", "All Points", grandTotal));
        
        renderManpowerTotals(totalsData);
    } catch (error) { 
        console.error(error); 
        alert("Error generating totals. Check console for details."); 
    }
}

async function getReadableScheme() {
    try {
        const response = await fetch('/api/readable-scheme', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ scheme_data: appState.scheme_data, cmd_names: appState.cmd_names, force_names: appState.force_names, heading: appState.scheme_heading, date: appState.scheme_date })
        });
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        renderGenericTable(await response.json(), 'readable-scheme-container');
    } catch (error) { console.error("Failed to get readable scheme:", error); }
}

async function getDeployedData() {
    try {
        const response = await fetch('/api/deployed-data', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ scheme_data: appState.scheme_data, nom_data: appState.nom_data, cmd_names: appState.cmd_names, force_names: appState.force_names, heading: appState.scheme_heading, date: appState.scheme_date })
        });
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        
        const data = await response.json();
        renderGenericTable(data.deployed, 'deployed-sheet-container');
        renderGenericTable(data.matrix, 'matrix-sheet-container');
    } catch (error) { console.error("Failed to get deployed data:", error); }
}

function renderGenericTable(data, containerId) {
    const container = document.getElementById(containerId);
    if (!container || !data || data.length === 0) {
        if (container) container.innerHTML = "<p>No data to display.</p>";
        return;
    }
    const headers = Object.keys(data[0]);
    let table = '<div class="table-container"><table class="data-grid"><thead><tr>';
    headers.forEach(h => table += `<th>${h}</th>`);
    table += '</tr></thead><tbody>';
    data.forEach(row => {
        table += '<tr>';
        headers.forEach(header => table += `<td>${row[header] || ''}</td>`);
        table += '</tr>';
    });
    table += '</tbody></table></div>';
    container.innerHTML = table;
    makeTableResizable(container.querySelector('table'));
}

// --- Nominal Roll State & UI ---
function saveNomState() {
    appState.nom_undo.push(JSON.parse(JSON.stringify(appState.nom_data)));
    appState.nom_redo = [];
    if (appState.nom_undo.length > 20) appState.nom_undo.shift();
}

function undoNom() {
    if (appState.nom_undo.length > 0) {
        appState.nom_redo.push(JSON.parse(JSON.stringify(appState.nom_data)));
        appState.nom_data = appState.nom_undo.pop();
        updateNominalViews();
    }
}

function redoNom() {
    if (appState.nom_redo.length > 0) {
        appState.nom_undo.push(JSON.parse(JSON.stringify(appState.nom_data)));
        appState.nom_data = appState.nom_redo.pop();
        updateNominalViews();
    }
}

function updateTallyDashboard() {
    const container = document.getElementById('nom-tally-dashboard');
    if (!container) return;
    
    const reqs = {};
    [...appState.cmd_names, ...appState.force_names].forEach(r => reqs[r] = 0);
    
    let last_z = "", last_d = "", last_s = "";
    appState.scheme_data.forEach(row => {
        let z = (row.Zone || "").trim();
        let d = (row.Division || "").trim();
        let s = (row.Sector || "").trim();
        
        if (z) { last_z = z; last_d = ""; last_s = ""; } else { z = last_z; }
        if (d) { last_d = d; last_s = ""; } else { d = last_d; }
        if (s) { last_s = s; } else { s = last_s; }
        
        if (!z && !d && !s) return;
        
        [...appState.cmd_names, ...appState.force_names].forEach(r => {
            reqs[r] += parseInt(row[r] || '0', 10) || 0;
        });
    });

    const dep = {}; const avail = {};
    [...appState.cmd_names, ...appState.force_names].forEach(r => { dep[r] = 0; avail[r] = 0; });
    
    appState.nom_data.forEach(row => {
        const rank = (row['Preferred Rank'] || "").trim();
        const duty = (row['Duty Allocation'] || "").trim();
        if (dep[rank] !== undefined) {
            if (duty && duty !== "Standby / Reserve") dep[rank]++;
            else avail[rank]++;
        }
    });

    let html = '';
    [...appState.cmd_names, ...appState.force_names].forEach(r => {
        const reqCount = reqs[r] || 0;
        const depCount = dep[r] || 0;
        const pool = depCount + (avail[r] || 0);
        const diff = pool - reqCount;
        const diffText = diff < 0 ? `${diff} short` : `+${diff} surplus`;
        const diffColor = diff < 0 ? '#ef4444' : '#10b981';
        
        html += `<div style="border: 1px solid #e2e8f0; padding: 10px 15px; border-radius: 8px; flex: 1; background: #f8fafc; box-shadow: 0 2px 4px rgba(0,0,0,0.05);">
            <div style="font-weight: 600; font-size: 1.1em; color: #1e293b;">${r}</div>
            <div style="font-size: 0.95em; color: #475569; margin: 5px 0;">Dep: ${depCount} / Req: ${reqCount}</div>
            <div style="color: ${diffColor}; font-weight: bold; font-size: 0.9em;">${diffText}</div>
        </div>`;
    });
    container.innerHTML = html;
}

function renderNominalTable(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    if (!appState.nom_data || appState.nom_data.length === 0) {
        container.innerHTML = "<p>No nominal roll data loaded. Please upload an Excel file.</p>";
        return;
    }

    let savedScrollTop = 0;
    const tableContainer = container.querySelector('.table-container');
    if (tableContainer) savedScrollTop = tableContainer.scrollTop;
    const windowScrollY = window.scrollY;

    const headers = ["Sl No", "Name", "Rank (Raw)", "GL Number", "PEN", "Unit", "Mobile", "Remarks", "Preferred Rank", "Duty Allocation"];
    let table = '<div class="table-container"><table class="data-grid"><thead><tr>';
    const allRanks = [...appState.cmd_names, ...appState.force_names];

    headers.forEach(h => table += `<th>${h}</th>`);
    table += '</tr></thead><tbody>';
    appState.nom_data.forEach((row, index) => {
        table += '<tr>';
        headers.forEach(header => {
            if (header === 'Preferred Rank') {
                const currentRank = row['Preferred Rank'] || '';
                const isValidRank = allRanks.includes(currentRank);
                const style = (!isValidRank && currentRank) ? 'style="background-color: #fee2e2; color: #b91c1c; font-weight: bold;"' : '';

                table += `<td><select class="nom-rank-select" data-row="${index}" ${style}>`;
                table += `<option value="">-- Select Rank --</option>`;
                allRanks.forEach(r => {
                    const selected = (r === currentRank) ? 'selected' : '';
                    table += `<option value="${r}" ${selected}>${r}</option>`;
                });
                if (!isValidRank && currentRank) {
                    table += `<option value="${currentRank}" selected disabled>${currentRank} (Unmapped)</option>`;
                }
                table += `</select></td>`;
            } else {
                table += `<td contenteditable="true" data-row="${index}" data-col="${header}">${row[header] || ''}</td>`;
            }
        });
        table += '</tr>';
    });
    table += '</tbody></table></div>';
    container.innerHTML = table;
    makeTableResizable(container.querySelector('table'));
    
    const newTableContainer = container.querySelector('.table-container');
    if (newTableContainer) newTableContainer.scrollTop = savedScrollTop;
    window.scrollTo(0, windowScrollY);

    container.querySelectorAll('.nom-rank-select').forEach(select => {
        select.addEventListener('change', function() {
            const rowIndex = this.getAttribute('data-row');
            const newVal = this.value;
            if (appState.nom_data[rowIndex]['Preferred Rank'] !== newVal) {
                saveNomState();
                appState.nom_data[rowIndex]['Preferred Rank'] = newVal;
                appState.nom_data[rowIndex]['Duty Allocation'] = "";
                appState.nom_data[rowIndex]['Assignment Type'] = "";
                
                // Visually update the cell without re-rendering the whole table
                const dutyCell = container.querySelector(`td[data-row="${rowIndex}"][data-col="Duty Allocation"]`);
                if (dutyCell) dutyCell.innerText = "";
                this.removeAttribute('style'); // Clear red error background if any
                
                renderManualAssignment();
                updateTallyDashboard();
            }
        });
    });

    container.querySelectorAll('td[contenteditable="true"]').forEach(cell => {
        cell.addEventListener('blur', function() {
            const rowIndex = this.getAttribute('data-row');
            const colName = this.getAttribute('data-col');
            const newVal = this.innerText.trim();
            if (appState.nom_data[rowIndex][colName] !== newVal) {
                saveNomState();
                appState.nom_data[rowIndex][colName] = newVal;
                if (colName === 'Duty Allocation' && newVal !== "") {
                    appState.nom_data[rowIndex]['Assignment Type'] = "Manual";
                }
            }
        });
    });
}


function renderManualAssignment() {
    const container = document.getElementById('manual-assign-container');
    if (!container) return;

    if (!appState.nom_data || appState.nom_data.length === 0) {
        container.innerHTML = "<p>No nominal roll data loaded. Please upload an Excel file.</p>";
        return;
    }

    let savedScrollTop = 0;
    const tableContainer = container.querySelector('.table-container');
    if (tableContainer) savedScrollTop = tableContainer.scrollTop;
    const windowScrollY = window.scrollY;

    let activeElementId = document.activeElement ? document.activeElement.id : null;
    let selectionStart = null;
    if (activeElementId === 'ma-name-filter') {
        try { selectionStart = document.activeElement.selectionStart; } catch(e) {}
    }

    if (!appState.ma_filters) appState.ma_filters = { z: 'All', d: 'All', s: 'All', unit: 'All', name: '', rank: appState.cmd_names[0], hideDeployed: false };

    const reqs = {};
    const dutyToHier = {};
    let seen_z = new Set(), seen_d = new Set(), seen_s = new Set();
    let last_z = "", last_d = "", last_s = "";

    appState.scheme_data.forEach((row) => {
        let z = (row['Zone'] || "").trim(), d = (row['Division'] || "").trim(), s = (row['Sector'] || "").trim();
        const p = (row['Point'] || "").trim();
        
        if (z) { last_z = z; last_d = ""; last_s = ""; } else { z = last_z; }
        if (d) { last_d = d; last_s = ""; } else { d = last_d; }
        if (s) { last_s = s; } else { s = last_s; }
        
        const z_key = z ? z : "UNZONED";
        const loc_z = z, loc_d = [z, d].filter(x=>x).join(", "), loc_s = [z, d, s].filter(x=>x).join(", "), loc_p = [z, d, s, p].filter(x=>x).join(", ");
        const sp = parseInt(row[appState.cmd_names[0]] || '0', 10) || 0;
        const dysp = parseInt(row[appState.cmd_names[1]] || '0', 10) || 0;
        const ip = parseInt(row[appState.cmd_names[2]] || '0', 10) || 0;
        const f1 = parseInt(row[appState.force_names[0]] || '0', 10) || 0;
        const f2 = parseInt(row[appState.force_names[1]] || '0', 10) || 0;
        const f3 = parseInt(row[appState.force_names[2]] || '0', 10) || 0;

        function addReq(dutyStr, rank, count) {
            if (!dutyStr || count <= 0) return;
            if (!reqs[dutyStr]) reqs[dutyStr] = {};
            reqs[dutyStr][rank] = (reqs[dutyStr][rank] || 0) + count;
        }

        if (z && !seen_z.has(z)) { if (sp) addReq(loc_z, appState.cmd_names[0], sp); seen_z.add(z); dutyToHier[loc_z] = {z, d:'', s:''}; }
        if (d && !seen_d.has(z_key + d)) { if (dysp) addReq(loc_d, appState.cmd_names[1], dysp); seen_d.add(z_key + d); dutyToHier[loc_d] = {z, d, s:''}; }
        if (s && !seen_s.has(z_key + d + s)) { if (ip) addReq(loc_s, appState.cmd_names[2], ip); seen_s.add(z_key + d + s); dutyToHier[loc_s] = {z, d, s}; }
        
        if (p) { 
            addReq(loc_p, appState.force_names[0], f1); addReq(loc_p, appState.force_names[1], f2); addReq(loc_p, appState.force_names[2], f3); dutyToHier[loc_p] = {z, d, s}; 
        } else if (s) {
            addReq(loc_s, appState.force_names[0], f1); addReq(loc_s, appState.force_names[1], f2); addReq(loc_s, appState.force_names[2], f3);
        } else if (d) {
            addReq(loc_d, appState.force_names[0], f1); addReq(loc_d, appState.force_names[1], f2); addReq(loc_d, appState.force_names[2], f3);
            if (ip) addReq(loc_d, appState.cmd_names[2], ip);
        } else if (z) {
            addReq(loc_z, appState.force_names[0], f1); addReq(loc_z, appState.force_names[1], f2); addReq(loc_z, appState.force_names[2], f3);
            if (dysp) addReq(loc_z, appState.cmd_names[1], dysp);
            if (ip) addReq(loc_z, appState.cmd_names[2], ip);
        }
    });

    const uniqueZones = new Set(); const uniqueDivs = new Set(); const uniqueSecs = new Set();
    Object.values(dutyToHier).forEach(h => {
        if (h.z) uniqueZones.add(h.z);
        const matchZ = appState.ma_filters.z === 'All' || h.z === appState.ma_filters.z;
        const matchD = appState.ma_filters.d === 'All' || h.d === appState.ma_filters.d;
        if (h.d && matchZ) uniqueDivs.add(h.d);
        if (h.s && matchZ && matchD) uniqueSecs.add(h.s);
    });

    const allRanks = [...appState.cmd_names, ...appState.force_names];
    if (!allRanks.includes(appState.ma_filters.rank)) appState.ma_filters.rank = allRanks[0];
    const selectedRank = appState.ma_filters.rank;

    const availOptions = [];
    appState.nom_data.forEach((p, idx) => {
        const pRank = (p['Preferred Rank'] || p['Rank (Raw)'] || "").trim();
        const pDuty = (p['Duty Allocation'] || "").trim();
        if (pRank === selectedRank && (!pDuty || pDuty === "Standby / Reserve")) {
            if (appState.ma_filters.unit !== 'All' && p.Unit !== appState.ma_filters.unit) return;
            if (appState.ma_filters.name && !(p.Name || "").toLowerCase().includes(appState.ma_filters.name.toLowerCase())) return;
            const remarksText = (p.Remarks || "").trim() || "nil";
            availOptions.push({ label: `${p.Name} (Unit: ${p.Unit || 'N/A'}) | Remarks: ${remarksText} [${idx}]`, idx });
        }
    });

    let html = `
        <div class="ma-filters">
            <div style="display: flex; gap: 10px; margin-bottom: 15px; align-items: center;">
                <select id="ma-z-filter" style="padding: 4px;"><option value="All">Filter Zone (All)</option>${[...uniqueZones].sort().map(z => `<option value="${z}" ${appState.ma_filters.z === z ? 'selected' : ''}>${z}</option>`).join('')}</select>
                <select id="ma-d-filter" style="padding: 4px;"><option value="All">Filter Division (All)</option>${[...uniqueDivs].sort().map(d => `<option value="${d}" ${appState.ma_filters.d === d ? 'selected' : ''}>${d}</option>`).join('')}</select>
                <select id="ma-s-filter" style="padding: 4px;"><option value="All">Filter Sector (All)</option>${[...uniqueSecs].sort().map(s => `<option value="${s}" ${appState.ma_filters.s === s ? 'selected' : ''}>${s}</option>`).join('')}</select>
                <button id="ma-reset-filtered-btn" class="stButton" style="padding: 4px 8px;">🔄 Reset Filtered</button>
                <button id="ma-autofill-btn" class="stButton" style="padding: 4px 8px; background-color: #28a745; color: white; border: none;">⚡ Auto-Fill Filtered</button>
                <label style="display: flex; align-items: center; margin-left: auto; cursor: pointer; font-weight: 600; color: #ef4444;">
                    <input type="checkbox" id="ma-hide-deployed-chk" ${appState.ma_filters.hideDeployed ? 'checked' : ''} style="margin-right: 5px;"> Hide Assigned Duties
                </label>
            </div>
            <div style="display: flex; gap: 10px; margin-bottom: 15px; align-items: center;">
                <select id="ma-unit-filter" style="padding: 4px;"><option value="All">Filter Unit (All)</option>${[...new Set(appState.nom_data.map(p => p.Unit).filter(x=>x))].sort().map(u => `<option value="${u}" ${appState.ma_filters.unit === u ? 'selected' : ''}>${u}</option>`).join('')}</select>
                <input type="text" id="ma-name-filter" placeholder="Search Personnel Name..." value="${appState.ma_filters.name}" style="padding: 4px; width: 250px;">
                <span style="margin-left: auto; font-weight: 600; color: #1d4ed8; background: #eff6ff; padding: 6px 12px; border-radius: 12px; border: 1px solid #bfdbfe;">
                    👤 ${availOptions.length} Available (Unassigned)
                </span>
            </div>
        </div>
        <div class="ma-rank-tabs" style="display: flex; gap: 5px; margin-bottom: 15px; border-bottom: 1px solid #ccc;">
    `;

    allRanks.forEach(r => {
        html += `<button class="ma-tab-btn ${selectedRank === r ? 'active' : ''}" data-rank="${r}" style="padding: 8px 16px; cursor: pointer; border: 1px solid #ccc; border-bottom: ${selectedRank === r ? 'none' : '1px solid #ccc'}; background: ${selectedRank === r ? '#fff' : '#f8f9fa'}; font-weight: ${selectedRank === r ? 'bold' : 'normal'}; transform: translateY(1px);">${r}</button>`;
    });

    html += `</div><div class="ma-slot-container">`;

    function keepDuty(duty) {
        if (!duty || duty === "Standby / Reserve") return true;
        const h = dutyToHier[duty] || {};
        if (appState.ma_filters.z !== 'All' && h.z !== appState.ma_filters.z) return false;
        if (appState.ma_filters.d !== 'All' && h.d !== appState.ma_filters.d) return false;
        if (appState.ma_filters.s !== 'All' && h.s !== appState.ma_filters.s) return false;
        return true;
    }

    const rankSlots = [];
    const assignedByDuty = {};
    
    appState.nom_data.forEach((p, idx) => {
        const pRank = (p['Preferred Rank'] || p['Rank (Raw)'] || "").trim();
        const pDuty = (p['Duty Allocation'] || "").trim();
        if (pRank === selectedRank && pDuty && pDuty !== "Standby / Reserve") {
            if (!assignedByDuty[pDuty]) assignedByDuty[pDuty] = [];
            const remarksText = (p.Remarks || "").trim() || "nil";
            assignedByDuty[pDuty].push({ label: `${p.Name} (Unit: ${p.Unit || 'N/A'}) | Remarks: ${remarksText} [${idx}]`, idx });
        }
    });

    Object.keys(reqs).forEach(duty => {
        if (reqs[duty][selectedRank] && keepDuty(duty)) {
            const count = reqs[duty][selectedRank];
            const assignedList = assignedByDuty[duty] || [];
            const totalSlots = Math.max(count, assignedList.length);
            const slotsForDuty = Array(totalSlots).fill(null);
            const unplaced = [];
            
            assignedList.forEach(a => {
                const prefSlot = appState.nom_data[a.idx]['_slot_idx'];
                if (typeof prefSlot === 'number' && prefSlot >= 0 && prefSlot < totalSlots && slotsForDuty[prefSlot] === null) slotsForDuty[prefSlot] = a;
                else unplaced.push(a);
            });
            
            unplaced.forEach(a => {
                const emptyIdx = slotsForDuty.indexOf(null);
                if (emptyIdx !== -1) { slotsForDuty[emptyIdx] = a; appState.nom_data[a.idx]['_slot_idx'] = emptyIdx; }
            });
            slotsForDuty.forEach((assigned, i) => { rankSlots.push({ duty, assigned, slotIdx: i }); });
        }
    });

    Object.keys(assignedByDuty).forEach(duty => {
        if ((!reqs[duty] || !reqs[duty][selectedRank]) && keepDuty(duty)) {
            assignedByDuty[duty].forEach((a, i) => { rankSlots.push({ duty, assigned: a, slotIdx: i }); });
        }
    });

    let availOptionsHtml = '';
    availOptions.forEach(opt => availOptionsHtml += `<option value="${opt.idx}">${opt.label}</option>`);

    html += `<div class="table-container"><table class="data-grid" style="min-width: 100%; width: max-content; word-wrap: break-word;"><thead><tr><th style="min-width: 150px;">Rank</th><th style="min-width: 300px;">Duty</th><th style="min-width: 400px;">Assigned Personnel</th></tr></thead><tbody>`;
    if (rankSlots.length === 0) {
        html += `<tr><td colspan="3">No duties require the rank: ${selectedRank} under current filters.</td></tr>`;
    } else {
        let visibleCount = 0;
        rankSlots.forEach(slot => {
            if (appState.ma_filters.hideDeployed && slot.assigned) return;
            visibleCount++;
            html += `<tr><td>${selectedRank}</td><td>${slot.duty}</td><td>
                <select class="ma-slot-select" data-duty="${slot.duty}" data-slot-idx="${slot.slotIdx !== undefined ? slot.slotIdx : ''}" data-old-idx="${slot.assigned ? slot.assigned.idx : ''}" style="width: 100%; padding: 4px;">
                    <option value="">-- Unassigned --</option>`;
            if (slot.assigned) html += `<option value="${slot.assigned.idx}" selected>${slot.assigned.label}</option>`;
            html += `</select></td></tr>`;
        });
        if (visibleCount === 0) {
            html += `<tr><td colspan="3">All duties for ${selectedRank} are fully assigned (or hidden by filters).</td></tr>`;
        }
    }
    html += `</tbody></table></div></div>`;
    container.innerHTML = html;
    
    makeTableResizable(container.querySelector('table'));
    const newTableContainer = container.querySelector('.table-container');
    if (newTableContainer) newTableContainer.scrollTop = savedScrollTop;
    window.scrollTo(0, windowScrollY);

    if (activeElementId === 'ma-name-filter') {
        const el = document.getElementById('ma-name-filter');
        if (el) { el.focus(); try { el.setSelectionRange(selectionStart, selectionStart); } catch(e) {} }
    }

    container.querySelector('#ma-z-filter').addEventListener('change', e => { appState.ma_filters.z = e.target.value; appState.ma_filters.d = 'All'; appState.ma_filters.s = 'All'; renderManualAssignment(); });
    container.querySelector('#ma-d-filter').addEventListener('change', e => { appState.ma_filters.d = e.target.value; appState.ma_filters.s = 'All'; renderManualAssignment(); });
    container.querySelector('#ma-s-filter').addEventListener('change', e => { appState.ma_filters.s = e.target.value; renderManualAssignment(); });
    container.querySelector('#ma-unit-filter').addEventListener('change', e => { appState.ma_filters.unit = e.target.value; renderManualAssignment(); });
    container.querySelector('#ma-name-filter').addEventListener('input', e => { appState.ma_filters.name = e.target.value; renderManualAssignment(); });
    container.querySelector('#ma-hide-deployed-chk').addEventListener('change', e => { appState.ma_filters.hideDeployed = e.target.checked; renderManualAssignment(); });
    container.querySelectorAll('.ma-tab-btn').forEach(btn => btn.addEventListener('click', e => { appState.ma_filters.rank = e.target.getAttribute('data-rank'); renderManualAssignment(); }));

    container.querySelector('#ma-reset-filtered-btn').addEventListener('click', () => {
        saveNomState();
        appState.nom_data.forEach((p, idx) => {
            const d = (p['Duty Allocation'] || "").trim();
            if (d && d !== "Standby / Reserve" && keepDuty(d)) {
                p['Duty Allocation'] = ""; p['Assignment Type'] = ""; delete p['_slot_idx'];
            }
        });
        renderManualAssignment();
    });

    container.querySelector('#ma-autofill-btn').addEventListener('click', () => {
        saveNomState();
        let assignedCount = 0;
        const available = [...availOptions];
        rankSlots.filter(s => s.assigned === null).forEach(slot => {
            if (available.length > 0) {
                const pIdx = available.shift().idx;
                appState.nom_data[pIdx]['Duty Allocation'] = slot.duty;
                appState.nom_data[pIdx]['Assignment Type'] = "Auto (Manual Assign)";
                if (slot.slotIdx !== undefined) appState.nom_data[pIdx]['_slot_idx'] = slot.slotIdx;
                assignedCount++;
            }
        });
        if (assignedCount > 0) renderManualAssignment();
        else alert("No available personnel or empty slots to fill under current filters.");
    });

    const tbody = container.querySelector('tbody');
    if (tbody) {
        let activeSelect = null;
        const hydrateSelect = (select) => {
            if (activeSelect && activeSelect !== select) {
                const currentVal = activeSelect.value;
                let baseHtml = '<option value="">-- Unassigned --</option>';
                if (currentVal !== "") {
                    const opt = activeSelect.querySelector(`option[value="${currentVal}"]`);
                    if (opt) baseHtml += `<option value="${currentVal}" selected>${opt.innerHTML}</option>`;
                }
                activeSelect.innerHTML = baseHtml;
                activeSelect.setAttribute('data-loaded', 'false');
            }
            if (select.getAttribute('data-loaded') !== 'true') {
                const currentVal = select.value;
                select.insertAdjacentHTML('beforeend', availOptionsHtml);
                select.value = currentVal;
                select.setAttribute('data-loaded', 'true');
                activeSelect = select;
            }
        };

        tbody.addEventListener('mousedown', e => { if (e.target.classList.contains('ma-slot-select')) hydrateSelect(e.target); });
        tbody.addEventListener('focusin', e => { if (e.target.classList.contains('ma-slot-select')) hydrateSelect(e.target); });

        tbody.addEventListener('change', e => {
            if (e.target.classList.contains('ma-slot-select')) {
                const select = e.target;
                const duty = select.getAttribute('data-duty'), slotIdxStr = select.getAttribute('data-slot-idx'), oldIdxStr = select.getAttribute('data-old-idx'), newIdxStr = select.value;
                if (oldIdxStr === newIdxStr) return;
                saveNomState();
                if (oldIdxStr !== "") {
                    const oIdx = parseInt(oldIdxStr, 10);
                    appState.nom_data[oIdx]['Duty Allocation'] = ""; appState.nom_data[oIdx]['Assignment Type'] = ""; delete appState.nom_data[oIdx]['_slot_idx'];
                }
                if (newIdxStr !== "") {
                    const nIdx = parseInt(newIdxStr, 10);
                    appState.nom_data[nIdx]['Duty Allocation'] = duty; appState.nom_data[nIdx]['Assignment Type'] = "Manual";
                    if (slotIdxStr !== "") appState.nom_data[nIdx]['_slot_idx'] = parseInt(slotIdxStr, 10);
                }
                renderManualAssignment();
            }
        });
    }
}

function updateNominalViews() {
    renderNominalTable('nom-editor-container');
    renderManualAssignment();
    updateTallyDashboard();
}

// --- Action Bindings ---
function saveSchemeState() { appState.scheme_undo.push(JSON.parse(JSON.stringify(appState.scheme_data))); appState.scheme_redo = []; if (appState.scheme_undo.length > 20) appState.scheme_undo.shift(); }
function undoScheme() { if (appState.scheme_undo.length > 0) { appState.scheme_redo.push(JSON.parse(JSON.stringify(appState.scheme_data))); appState.scheme_data = appState.scheme_undo.pop(); renderSchemeTable(); } }
function redoScheme() { if (appState.scheme_redo.length > 0) { appState.scheme_undo.push(JSON.parse(JSON.stringify(appState.scheme_data))); appState.scheme_data = appState.scheme_redo.pop(); renderSchemeTable(); } }

function getSelectedIndices() { return appState.scheme_data.map((row, idx) => row.Select ? idx : -1).filter(idx => idx !== -1); }

async function postSchemeAction(endpoint, payloadExtras = {}) {
    saveSchemeState();
    try {
        const payload = { scheme_data: appState.scheme_data, cmd_names: appState.cmd_names, force_names: appState.force_names, ...payloadExtras };
        const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        appState.scheme_data = await response.json();
        renderSchemeTable();
        alert("Action completed successfully!");
    } catch (error) { alert("Error: Could not complete action."); undoScheme(); }
}

function sortScheme() { postSchemeAction('/api/sort-scheme'); }
function addBlankRows() {
    saveSchemeState();
    const headers = getSchemeHeaders();
    for (let i = 0; i < 10; i++) { const row = { Select: false }; headers.forEach(h => row[h] = ""); appState.scheme_data.push(row); }
    renderSchemeTable();
}

function auditScheme() {
    let errors = [];
    appState.scheme_data.forEach((row, idx) => {
        const d = (row['Division'] || "").trim(), s = (row['Sector'] || "").trim(), p = (row['Point'] || "").trim();
        let hasForce = appState.force_names.some(f => (row[f] || "").trim());
        if ((p || hasForce) && (!d || !s)) errors.push(idx + 1);
    });
    if (errors.length > 0) alert(`Found rows missing Division/Sector! Check rows: ${errors.join(', ')}`); else alert("Scheme is clean!");
}

function cloneSelected() {
    const selectedIndices = getSelectedIndices();
    if (selectedIndices.length === 0) return alert("Select rows first by checking the boxes!");
    const level = document.getElementById('clone-level-select').value;
    const labelsStr = document.getElementById('clone-labels-input').value;
    if (!labelsStr) return alert("Please enter labels for cloning (e.g. Day, Night).");
    postSchemeAction('/api/clone-rows', { selected_indices: selectedIndices, level, labels: labelsStr.split(',').map(l => l.trim()) });
}

function groupSelected(level) {
    const selectedIndices = getSelectedIndices();
    if (selectedIndices.length === 0) return alert("Select rows first by checking the boxes!");
    const name = prompt(`Enter ${level} Name:`, "");
    if (!name) return;
    postSchemeAction('/api/group-rows', { selected_indices: selectedIndices, level, name });
}

function duplicateSelected() {
    const selectedIndices = getSelectedIndices();
    if (selectedIndices.length === 0) return alert("Select rows first by checking the boxes!");
    const copies = parseInt(prompt("Number of copies:", "1")) || 1;
    postSchemeAction('/api/duplicate-rows', { selected_indices: selectedIndices, copies });
}

function fillDownSelected() {
    const selectedIndices = getSelectedIndices();
    if (selectedIndices.length === 0) return alert("Select rows first by checking the boxes!");
    const colsStr = prompt("Columns to fill down (comma-separated):", appState.force_names.join(", "));
    if (!colsStr) return;
    postSchemeAction('/api/fill-down', { selected_indices: selectedIndices, columns: colsStr.split(',').map(c => c.trim()) });
}

async function uploadSchemeExcel(fileInput) {
    if (!fileInput.files.length) return;
    const formData = new FormData();
    formData.append('file', fileInput.files[0]);
    formData.append('cmd_names', appState.cmd_names.join(','));
    formData.append('force_names', appState.force_names.join(','));
    saveSchemeState();
    try {
        const response = await fetch('/api/upload-scheme', { method: 'POST', body: formData });
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        appState.scheme_data = await response.json();
        renderSchemeTable(); alert("Scheme Loaded!");
    } catch(error) { alert("Error loading Excel file."); undoScheme(); }
    fileInput.value = "";
}

async function uploadNominalExcel(fileInput) {
    if (!fileInput.files.length) return;
    const formData = new FormData();
    formData.append('file', fileInput.files[0]);
    saveNomState();
    try {
        const response = await fetch('/api/upload-nominal', { method: 'POST', body: formData });
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        appState.nom_data = await response.json();
        updateNominalViews(); alert("Nominal Roll Loaded!");
    } catch(error) { alert("Error loading Excel file."); undoNom(); }
    fileInput.value = "";
}

async function postNomAction(endpoint) {
    saveNomState();
    try {
        const payload = { scheme_data: appState.scheme_data, nom_data: appState.nom_data, cmd_names: appState.cmd_names, force_names: appState.force_names };
        const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        appState.nom_data = await response.json();
        updateNominalViews(); alert("Action completed successfully!");
    } catch (error) { alert("Error: Could not complete action."); undoNom(); }
}

function cleanRanks() { postNomAction('/api/clean-ranks'); }
function autoAllocate() { postNomAction('/api/auto-allocate'); }
function qrtSweep() { postNomAction('/api/qrt-sweep'); }
function resetAuto() { saveNomState(); appState.nom_data.forEach(row => { if (row['Assignment Type'] === 'Auto') { row['Duty Allocation'] = ""; row['Assignment Type'] = ""; } }); updateNominalViews(); alert("Auto allocations reset!"); }
function resetAll() { saveNomState(); appState.nom_data.forEach(row => { row['Duty Allocation'] = ""; row['Assignment Type'] = ""; }); updateNominalViews(); alert("All allocations reset!"); }

function findDuplicates() {
    const seen_pen = {}; const seen_mob = {}; const dupes = [];
    appState.nom_data.forEach((row, idx) => {
        const pen = (row['PEN'] || "").replace('.0','').trim(), mob = (row['Mobile'] || "").replace('.0','').trim();
        if (pen && seen_pen[pen]) dupes.push(`Row ${idx+1} (PEN: ${pen}) duplicates Row ${seen_pen[pen]}`); else if (pen) seen_pen[pen] = idx + 1;
        if (mob && seen_mob[mob]) dupes.push(`Row ${idx+1} (Mobile: ${mob}) duplicates Row ${seen_mob[mob]}`); else if (mob) seen_mob[mob] = idx + 1;
    });
    if (dupes.length > 0) alert("Duplicates Found:\n\n" + dupes.join("\n")); else alert("No duplicate PEN or Mobile numbers found!");
}

function openTab(evt, tabName) {
    const tabcontent = document.getElementsByClassName("tab-content");
    for (let i = 0; i < tabcontent.length; i++) tabcontent[i].style.display = "none";
    const tablinks = document.getElementsByClassName("tab-link");
    for (let i = 0; i < tablinks.length; i++) tablinks[i].className = tablinks[i].className.replace(" active", "");
    document.getElementById(tabName).style.display = "block";
    evt.currentTarget.className += " active";
    if (tabName === 'tab4' || tabName === 'tab5') updateNominalViews();
}

function bindIfExists(id, event, handler) { const el = document.getElementById(id); if (el) el.addEventListener(event, handler); }

document.addEventListener('DOMContentLoaded', () => {
    initializeState();
    renderSchemeTable();

    bindIfExists('scheme-heading-input', 'input', e => appState.scheme_heading = e.target.value);
    bindIfExists('scheme-date-input', 'input', e => appState.scheme_date = e.target.value);

    // DOM Bindings
    bindIfExists('align-scheme-btn', 'click', alignScheme);
    bindIfExists('get-totals-btn', 'click', getManpowerTotals);
    bindIfExists('get-readable-btn', 'click', getReadableScheme);
    bindIfExists('get-deployed-btn', 'click', getDeployedData);
    bindIfExists('sort-scheme-btn', 'click', sortScheme);
    bindIfExists('add-blank-rows-btn', 'click', addBlankRows);
    bindIfExists('audit-scheme-btn', 'click', auditScheme);
    bindIfExists('undo-scheme-btn', 'click', undoScheme);
    bindIfExists('redo-scheme-btn', 'click', redoScheme);
    bindIfExists('clone-selected-btn', 'click', cloneSelected);
    bindIfExists('group-zone-btn', 'click', () => groupSelected("Zone"));
    bindIfExists('group-div-btn', 'click', () => groupSelected("Division"));
    bindIfExists('group-sec-btn', 'click', () => groupSelected("Sector"));
    bindIfExists('duplicate-selected-btn', 'click', duplicateSelected);
    bindIfExists('fill-down-btn', 'click', fillDownSelected);

    const uploadInput = document.getElementById('upload-scheme-input');
    if (uploadInput) uploadInput.addEventListener('change', function() { uploadSchemeExcel(this); });
    const uploadNomInput = document.getElementById('upload-nom-input');
    if (uploadNomInput) uploadNomInput.addEventListener('change', function() { uploadNominalExcel(this); });

    bindIfExists('clean-ranks-btn', 'click', cleanRanks);
    bindIfExists('find-dupes-btn', 'click', findDuplicates);
    bindIfExists('auto-allocate-btn', 'click', autoAllocate);
    bindIfExists('qrt-sweep-btn', 'click', qrtSweep);
    bindIfExists('reset-auto-btn', 'click', resetAuto);
    bindIfExists('reset-all-btn', 'click', resetAll);

    // --- GLOBAL SETTINGS & PROJECT LOAD/SAVE BINDINGS ---
    bindIfExists('save-settings-btn', 'click', () => {
        appState.theme = document.getElementById('theme-select').value;
        appState.cmd_names = [document.getElementById('cmd-z').value, document.getElementById('cmd-d').value, document.getElementById('cmd-s').value];
        appState.force_names = [document.getElementById('f-1').value, document.getElementById('f-2').value, document.getElementById('f-3').value];
        renderSchemeTable(); updateNominalViews(); alert("Settings saved!");
    });

    bindIfExists('save-proj-btn', 'click', () => {
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(appState));
        const a = document.createElement('a');
        a.setAttribute("href", dataStr);
        a.setAttribute("download", "My_Scheme.scproj");
        a.click();
    });

    const loadProjInput = document.getElementById('load-proj-input');
    if (loadProjInput) loadProjInput.addEventListener('change', function(e) {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = function(evt) {
            try {
                const loaded = JSON.parse(evt.target.result);
                
                // Explicitly overwrite state to prevent array merging glitches
                appState.cmd_names = loaded.cmd_names || ["SP", "DySP", "IP"];
                appState.force_names = loaded.force_names || ["SI/ASI", "SCPO/CPO", "WSCPO/WCPO"];
                appState.scheme_data = loaded.scheme_data || [];
                appState.nom_data = loaded.nom_data || [];
                appState.theme = loaded.theme || "Default Blue";
                appState.scheme_undo = loaded.scheme_undo || [];
                appState.scheme_redo = loaded.scheme_redo || [];
                appState.nom_undo = loaded.nom_undo || [];
                appState.nom_redo = loaded.nom_redo || [];
                appState.colWidths = loaded.colWidths || {};
                appState.ma_filters = loaded.ma_filters || null;
                appState.scheme_heading = loaded.scheme_heading || "";
                appState.scheme_date = loaded.scheme_date || "";

                const hInput = document.getElementById('scheme-heading-input'); if (hInput) hInput.value = appState.scheme_heading;
                const dInput = document.getElementById('scheme-date-input'); if (dInput) dInput.value = appState.scheme_date;

                document.getElementById('theme-select').value = appState.theme || "Default Blue";
                document.getElementById('cmd-z').value = appState.cmd_names[0]; document.getElementById('cmd-d').value = appState.cmd_names[1]; document.getElementById('cmd-s').value = appState.cmd_names[2];
                document.getElementById('f-1').value = appState.force_names[0]; document.getElementById('f-2').value = appState.force_names[1]; document.getElementById('f-3').value = appState.force_names[2];
                
                renderSchemeTable(); 
                updateNominalViews(); 
                
                // Clear stale generated reports from any previous session
                ['manpower-totals-container', 'readable-scheme-container', 'deployed-sheet-container', 'matrix-sheet-container'].forEach(id => {
                    const el = document.getElementById(id); if(el) el.innerHTML = "";
                });

                alert("Project loaded successfully! You can resume from where you left off.");
            } catch(err) { console.error(err); alert("Failed to parse project file."); }
            
            e.target.value = ""; // Reset the input so the same file can be loaded again if needed
        };
        reader.readAsText(file);
    });

    // --- DOWNLOAD BINDINGS ---
    bindIfExists('dl-raw-btn', 'click', () => downloadBlob('/api/download/raw-scheme', {scheme_data: appState.scheme_data}, 'Raw_Scheme.xlsx'));
    bindIfExists('dl-totals-btn', 'click', () => downloadBlob('/api/download/totals', {scheme_data: appState.scheme_data, cmd_names: appState.cmd_names, force_names: appState.force_names, theme: appState.theme}, 'Manpower_Totals.xlsx'));
    bindIfExists('dl-readable-xls', 'click', () => downloadBlob('/api/download/readable-excel', {scheme_data: appState.scheme_data, cmd_names: appState.cmd_names, force_names: appState.force_names, theme: appState.theme, heading: appState.scheme_heading, date: appState.scheme_date}, 'Readable_Scheme.xlsx'));
    bindIfExists('dl-readable-pdf', 'click', () => downloadBlob('/api/download/readable-html', {scheme_data: appState.scheme_data, cmd_names: appState.cmd_names, force_names: appState.force_names, theme: appState.theme, heading: appState.scheme_heading, date: appState.scheme_date}, 'Readable_Scheme.html'));
    
    bindIfExists('t4-undo-btn', 'click', undoNom);
    bindIfExists('t4-redo-btn', 'click', redoNom);
    bindIfExists('dl-nom-template-btn', 'click', () => downloadBlob('/api/download/nom-template', {}, 'Blank_Roster_Template.xlsx'));
    bindIfExists('dl-nom-roll-btn', 'click', () => downloadBlob('/api/download/nom-roll', {nom_data: appState.nom_data}, 'Nominal_Roll.xlsx'));

    bindIfExists('dl-dep-xls-full', 'click', () => downloadBlob('/api/download/deployed-excel', {scheme_data: appState.scheme_data, nom_data: appState.nom_data, cmd_names: appState.cmd_names, force_names: appState.force_names, theme: appState.theme, mode: 'full', heading: appState.scheme_heading, date: appState.scheme_date}, 'Deployed_Sheet.xlsx'));
    bindIfExists('dl-dep-xls-zone', 'click', () => downloadBlob('/api/download/deployed-excel', {scheme_data: appState.scheme_data, nom_data: appState.nom_data, cmd_names: appState.cmd_names, force_names: appState.force_names, theme: appState.theme, mode: 'zone_sheets', heading: appState.scheme_heading, date: appState.scheme_date}, 'Deployed_Zones.xlsx'));
    bindIfExists('dl-dep-html', 'click', () => downloadBlob('/api/download/deployed-html', {scheme_data: appState.scheme_data, nom_data: appState.nom_data, cmd_names: appState.cmd_names, force_names: appState.force_names, theme: appState.theme, heading: appState.scheme_heading, date: appState.scheme_date}, 'Deployed_Report.html'));

    bindIfExists('dl-mat-xls-full', 'click', () => downloadBlob('/api/download/matrix-excel', {scheme_data: appState.scheme_data, nom_data: appState.nom_data, cmd_names: appState.cmd_names, force_names: appState.force_names, theme: appState.theme, mode: 'full', heading: appState.scheme_heading, date: appState.scheme_date}, 'Matrix_Sheet.xlsx'));
    bindIfExists('dl-mat-xls-zone', 'click', () => downloadBlob('/api/download/matrix-excel', {scheme_data: appState.scheme_data, nom_data: appState.nom_data, cmd_names: appState.cmd_names, force_names: appState.force_names, theme: appState.theme, mode: 'zone_sheets', heading: appState.scheme_heading, date: appState.scheme_date}, 'Matrix_Zones.xlsx'));
    bindIfExists('dl-mat-html', 'click', () => downloadBlob('/api/download/matrix-html', {scheme_data: appState.scheme_data, nom_data: appState.nom_data, cmd_names: appState.cmd_names, force_names: appState.force_names, theme: appState.theme, heading: appState.scheme_heading, date: appState.scheme_date}, 'Matrix_Report.html'));
});
