// --- Application State Management ---

// This object holds all the data, similar to st.session_state
const appState = {
    cmd_names: ["SP", "DySP", "IP"],
    force_names: ["SI/ASI", "SCPO/CPO", "WSCPO/WCPO"],
    scheme_data: [],
    nom_data: [],
    theme: "Default Blue",
    scheme_filter: { z: null, d: null, s: null },
    scheme_undo: [],
    scheme_redo: [],
    nom_undo: [],
    nom_redo: [],
    colWidths: {},
    scheme_heading: "",
    scheme_date: "",
    scheme_conclusion: "",
    nom_filters: {},
    nom_unassigned_only: false,
    ns_filtered_data: [],
    logs: [],
    custom_theme: { "z": "#1f497d", "d": "#4f81bd", "s": "#dce6f1", "gt": "#d4edda", "zf": "#ffffff", "df": "#ffffff", "sf": "#000000", "p": "#ffffff", "st": "#f2f2f2", "zt": "#e6e6e6" }
};

// Global variable to track the currently open or saved file handle
let currentFileHandle = null;

function logAction(msg) {
    const time = new Date().toLocaleTimeString();
    appState.logs.unshift(`<span style="color:#64748b;">[${time}]</span> ${msg}`);
    if (appState.logs.length > 100) appState.logs.pop(); // Keep last 100 actions
    const container = document.getElementById('log-container');
    if (container) container.innerHTML = appState.logs.map(l => `<div class="log-entry">${l}</div>`).join('');
}

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
    // Only target the top header row, ignore filter input rows
    const cols = table.querySelectorAll('thead tr:first-child th');
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

function toggleTree(element) {
    const nested = element.parentElement.querySelector(".tree-nested");
    if(nested) nested.classList.toggle("tree-active");
    element.classList.toggle("caret-down");
}

function filterSchemeTree(z, d, s) {
    appState.scheme_filter = { z, d, s };
    renderSchemeTable();
}

function renderSchemeTree() {
    const container = document.getElementById('scheme-tree-container');
    if (!container) return;

    const hierarchy = { zones: {} };
    let cz = "", cd = "", cs = "";
    appState.scheme_data.forEach((row) => {
        let z = (row.Zone || "").trim();
        let d = (row.Division || "").trim();
        let s = (row.Sector || "").trim();
        
        if (z) { cz = z; cd = ""; cs = ""; }
        if (d) { cd = d; cs = ""; }
        if (s) { cs = s; }
        
        let activeZ = cz || "UNZONED";
        if (!hierarchy.zones[activeZ]) hierarchy.zones[activeZ] = { divs: {} };
        
        if (cd) {
            if (!hierarchy.zones[activeZ].divs[cd]) hierarchy.zones[activeZ].divs[cd] = { secs: {} };
            if (cs) {
                if (!hierarchy.zones[activeZ].divs[cd].secs[cs]) hierarchy.zones[activeZ].divs[cd].secs[cs] = true;
            }
        }
    });

    let html = '<ul class="tree-ul root" style="list-style-type: none; padding: 0; margin: 0; font-size: 13px;">';
    const isAllSelected = !appState.scheme_filter.z;
    html += `<li><span class="tree-item ${isAllSelected ? 'selected' : ''}" onclick="filterSchemeTree(null, null, null)">🌍 All Scheme Data</span></li>`;
    
    Object.keys(hierarchy.zones).forEach(z => {
        const zData = hierarchy.zones[z];
        const hasDivs = Object.keys(zData.divs).length > 0;
        const isZSelected = appState.scheme_filter.z === z && !appState.scheme_filter.d;
        const zExpanded = appState.scheme_filter.z === z;
        
        html += `<li style="margin-top: 4px;">`;
        if (hasDivs) html += `<span class="tree-caret ${zExpanded ? 'caret-down' : ''}" onclick="toggleTree(this)">▶</span>`;
        else html += `<span style="width: 14px; display: inline-block;"></span>`;
        
        html += `<span class="tree-item ${isZSelected ? 'selected' : ''}" onclick="filterSchemeTree('${z.replace(/'/g, "\\'")}', null, null)">🏢 ${z}</span>`;
        
        if (hasDivs) {
            html += `<ul class="tree-ul tree-nested ${zExpanded ? 'tree-active' : ''}" style="list-style-type: none; padding-left: 15px; margin: 0;">`;
            Object.keys(zData.divs).forEach(d => {
                const dData = zData.divs[d];
                const hasSecs = Object.keys(dData.secs).length > 0;
                const isDSelected = appState.scheme_filter.z === z && appState.scheme_filter.d === d && !appState.scheme_filter.s;
                const dExpanded = zExpanded && appState.scheme_filter.d === d;
                
                html += `<li style="margin-top: 2px;">`;
                if (hasSecs) html += `<span class="tree-caret ${dExpanded ? 'caret-down' : ''}" onclick="toggleTree(this)">▶</span>`;
                else html += `<span style="width: 14px; display: inline-block;"></span>`;
                
                html += `<span class="tree-item ${isDSelected ? 'selected' : ''}" onclick="filterSchemeTree('${z.replace(/'/g, "\\'")}', '${d.replace(/'/g, "\\'")}', null)">🛡️ ${d}</span>`;
                
                if (hasSecs) {
                    html += `<ul class="tree-ul tree-nested ${dExpanded ? 'tree-active' : ''}" style="list-style-type: none; padding-left: 15px; margin: 0;">`;
                    Object.keys(dData.secs).forEach(s => {
                        const isSSelected = appState.scheme_filter.z === z && appState.scheme_filter.d === d && appState.scheme_filter.s === s;
                        html += `<li style="margin-top: 2px;"><span style="width: 14px; display: inline-block;"></span><span class="tree-item ${isSSelected ? 'selected' : ''}" onclick="filterSchemeTree('${z.replace(/'/g, "\\'")}', '${d.replace(/'/g, "\\'")}', '${s.replace(/'/g, "\\'")}')">🎯 ${s}</span></li>`;
                    });
                    html += `</ul>`;
                }
                html += `</li>`;
            });
            html += `</ul>`;
        }
        html += `</li>`;
    });
    html += '</ul>';

    container.innerHTML = `<h4 style="margin-top: 0; margin-bottom: 10px; font-size: 14px; color: #334155; border-bottom: 1px solid #e2e8f0; padding-bottom: 5px;">📍 Scheme Hierarchy</h4>${html}`;
}

function renderSchemeTable() {
    const container = document.getElementById('scheme-editor-container');
    if (!container) return;

    let cz = "", cd = "", cs = "";
    const visibleIndices = [];
    if (!appState.scheme_filter) appState.scheme_filter = { z: null, d: null, s: null };

    appState.scheme_data.forEach((row, idx) => {
        let z = (row.Zone || "").trim();
        let d = (row.Division || "").trim();
        let s = (row.Sector || "").trim();
        
        if (z) { cz = z; cd = ""; cs = ""; }
        if (d) { cd = d; cs = ""; }
        if (s) { cs = s; }
        
        let activeZ = cz || "UNZONED";
        let visible = true;
        if (appState.scheme_filter.z && appState.scheme_filter.z !== activeZ) visible = false;
        if (appState.scheme_filter.d && appState.scheme_filter.d !== cd) visible = false;
        if (appState.scheme_filter.s && appState.scheme_filter.s !== cs) visible = false;
        
        if (visible) visibleIndices.push(idx);
    });

    const headers = getSchemeHeaders();
    let table = '<div class="table-container"><table class="data-grid">';
    
    // Header Row
    table += '<thead><tr><th>Select</th>';
    headers.forEach(h => table += `<th>${h}</th>`);
    table += '</tr></thead>';

    // Data Rows
    table += '<tbody>';
    visibleIndices.forEach(index => {
        const row = appState.scheme_data[index];
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
                if (['Zone', 'Division', 'Sector'].includes(colName)) renderSchemeTree();
        });
    });
        
    renderSchemeTree();
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
    "Cyberpunk Neon": {"z": "#0d0221", "d": "#240046", "s": "#ff007f", "gt": "#00f0ff", "zf": "#00f0ff", "df": "#ff007f", "sf": "#ffffff"},
    "Autumn Leaves": {"z": "#d84315", "d": "#f4511e", "s": "#ffcc80", "gt": "#ffab40", "zf": "#ffffff", "df": "#ffffff", "sf": "#000000"},
    "Spring Blossom": {"z": "#880e4f", "d": "#ab47bc", "s": "#f8bbd0", "gt": "#f06292", "zf": "#ffffff", "df": "#ffffff", "sf": "#000000"},
    "Midnight Blue": {"z": "#001021", "d": "#002142", "s": "#003263", "gt": "#6da0d1", "zf": "#ffffff", "df": "#ffffff", "sf": "#ffffff"},
    "Coffee Roaster": {"z": "#3e2723", "d": "#5d4037", "s": "#d7ccc8", "gt": "#a1887f", "zf": "#ffffff", "df": "#ffffff", "sf": "#000000"},
    "Minty Fresh": {"z": "#004d40", "d": "#00796b", "s": "#b2dfdb", "gt": "#4db6ac", "zf": "#ffffff", "df": "#ffffff", "sf": "#000000"},
    "Solar Flare": {"z": "#bf360c", "d": "#f4511e", "s": "#ffccbc", "gt": "#ff8a65", "zf": "#ffffff", "df": "#ffffff", "sf": "#000000"},
    "Deep Ocean": {"z": "#01579b", "d": "#0277bd", "s": "#b3e5fc", "gt": "#4fc3f7", "zf": "#ffffff", "df": "#ffffff", "sf": "#000000"},
    "Lavender Dream": {"z": "#311b92", "d": "#512da8", "s": "#d1c4e9", "gt": "#9575cd", "zf": "#ffffff", "df": "#ffffff", "sf": "#000000"},
    "Neon Green": {"z": "#000000", "d": "#111111", "s": "#333333", "gt": "#39ff14", "zf": "#39ff14", "df": "#39ff14", "sf": "#39ff14"},
    "Corporate Gray": {"z": "#37474f", "d": "#546e7a", "s": "#cfd8dc", "gt": "#90a4ae", "zf": "#ffffff", "df": "#ffffff", "sf": "#000000"},
    "Berry Blast": {"z": "#4a148c", "d": "#7b1fa2", "s": "#e1bee7", "gt": "#ba68c8", "zf": "#ffffff", "df": "#ffffff", "sf": "#000000"},
    "Gold Rush": {"z": "#f57f17", "d": "#ff8f00", "s": "#fff59d", "gt": "#ffd54f", "zf": "#000000", "df": "#000000", "sf": "#000000"},
    "Ice Glacier": {"z": "#01579b", "d": "#0288d1", "s": "#e1f5fe", "gt": "#81d4fa", "zf": "#ffffff", "df": "#ffffff", "sf": "#000000"},
    "Volcanic Ash": {"z": "#212121", "d": "#424242", "s": "#9e9e9e", "gt": "#ff5722", "zf": "#ffffff", "df": "#ffffff", "sf": "#000000"},
    "Jungle Canopy": {"z": "#1b5e20", "d": "#33691e", "s": "#c8e6c9", "gt": "#81c784", "zf": "#ffffff", "df": "#ffffff", "sf": "#000000"},
    "Dusk Skyline": {"z": "#283593", "d": "#4527a0", "s": "#ffccbc", "gt": "#ff7043", "zf": "#ffffff", "df": "#ffffff", "sf": "#000000"},
    "Pastel Rainbow": {"z": "#ba68c8", "d": "#4fc3f7", "s": "#fff176", "gt": "#ff8a65", "zf": "#ffffff", "df": "#000000", "sf": "#000000"},
    "Vampire Red": {"z": "#1a0000", "d": "#330000", "s": "#800000", "gt": "#ff0000", "zf": "#ffcccc", "df": "#ffcccc", "sf": "#ffffff"},
    "Monochrome Grayscale": {"z": "#111111", "d": "#555555", "s": "#aaaaaa", "gt": "#333333", "zf": "#ffffff", "df": "#ffffff", "sf": "#000000"},
    "Electric Indigo": {"z": "#1a237e", "d": "#283593", "s": "#c5cae9", "gt": "#5c6bc0", "zf": "#ffffff", "df": "#ffffff", "sf": "#000000"}
};

function getActiveThemeColors() {
    if (appState.theme === "Custom") return appState.custom_theme;
    return THEME_COLORS[appState.theme] || THEME_COLORS["Default Blue"];
}

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

    const activeTheme = getActiveThemeColors();
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
        logAction("Auto-Aligned Scheme Data.");
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
            body: JSON.stringify({ scheme_data: appState.scheme_data, cmd_names: appState.cmd_names, force_names: appState.force_names, theme: appState.theme, custom_theme: appState.custom_theme, heading: appState.scheme_heading, date: appState.scheme_date })
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
            body: JSON.stringify({ scheme_data: appState.scheme_data, nom_data: appState.nom_data, cmd_names: appState.cmd_names, force_names: appState.force_names, theme: appState.theme, custom_theme: appState.custom_theme, heading: appState.scheme_heading, date: appState.scheme_date, conclusion: appState.scheme_conclusion })
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
    let table = '<div class="table-container"><table class="data-grid">';
    
    // Hide the main table header specifically for the deployed sheet as requested
    if (containerId !== 'deployed-sheet-container') {
        table += '<thead><tr>';
        headers.forEach(h => table += `<th>${h}</th>`);
        table += '</tr></thead>';
    }
    
    table += '<tbody>';
    data.forEach(row => {
        table += '<tr>';
        let c_idx = 0;
        while (c_idx < headers.length) {
            if (c_idx < headers.length - 1 && row[headers[c_idx+1]] === "__MERGE__") {
                let colspan = 1;
                while (c_idx + colspan < headers.length && row[headers[c_idx+colspan]] === "__MERGE__") {
                    colspan++;
                }
                table += `<td colspan="${colspan}" style="text-align: center; vertical-align: middle;">${row[headers[c_idx]] || ''}</td>`;
                c_idx += colspan;
            } else {
                let val = row[headers[c_idx]];
                if (val === "__MERGE__") val = "";
                table += `<td>${val || ''}</td>`;
                c_idx++;
            }
        }
        table += '</tr>';
    });
    table += '</tbody></table></div>';
    container.innerHTML = table;
    
    if (containerId !== 'deployed-sheet-container') {
        makeTableResizable(container.querySelector('table'));
    }
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

    let activeFilterCol = null;
    let selectionStart = null;
    if (document.activeElement && document.activeElement.classList.contains('nom-filter-input')) {
        activeFilterCol = document.activeElement.getAttribute('data-col');
        try { selectionStart = document.activeElement.selectionStart; } catch(e) {}
    }

    if (!appState.nom_filters) appState.nom_filters = {};

    const headers = ["Sl No", "Name", "Rank (Raw)", "GL Number", "PEN", "Unit", "Mobile", "Remarks", "Preferred Rank", "Duty Allocation"];
    let table = '<div class="table-container"><table class="data-grid"><thead><tr><th>Select</th>';
    const allRanks = [...appState.cmd_names, ...appState.force_names];

    headers.forEach(h => table += `<th>${h}</th>`);
    table += '</tr><tr class="filter-row"><th style="background: #f1f5f9;"></th>';
    
    headers.forEach(h => {
        const val = appState.nom_filters[h] || '';
        table += `<th style="padding: 4px; background: #f1f5f9;"><input type="text" class="nom-filter-input" data-col="${h}" value="${val}" placeholder="Filter..." style="width: 100%; box-sizing: border-box; font-size: 0.85em; padding: 4px; border: 1px solid #cbd5e1; border-radius: 4px; font-weight: normal;"></th>`;
    });
    
    table += '</tr></thead><tbody>';

    let filteredData = appState.nom_data.map((row, idx) => ({ row, idx }));

    if (appState.nom_unassigned_only) {
        filteredData = filteredData.filter(item => {
            const duty = (item.row['Duty Allocation'] || "").trim();
            return !duty || duty === "Standby / Reserve";
        });
    }

    Object.keys(appState.nom_filters).forEach(col => {
        const term = appState.nom_filters[col].toLowerCase();
        if (term) {
            filteredData = filteredData.filter(item => (item.row[col] || "").toLowerCase().includes(term));
        }
    });

    filteredData.forEach(({ row, idx: index }) => {
        table += '<tr>';
        const isChecked = row.Select ? 'checked' : '';
        table += `<td style="text-align: center;"><input type="checkbox" class="nom-row-select-checkbox" data-row="${index}" ${isChecked}></td>`;
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

    if (activeFilterCol) {
        const el = container.querySelector(`.nom-filter-input[data-col="${activeFilterCol}"]`);
        if (el) {
            el.focus();
            try { el.setSelectionRange(selectionStart, selectionStart); } catch(e) {}
        }
    }

    container.querySelectorAll('.nom-filter-input').forEach(inp => {
        inp.addEventListener('input', function() {
            appState.nom_filters[this.getAttribute('data-col')] = this.value;
            renderNominalTable(containerId);
        });
    });

    container.querySelectorAll('.nom-row-select-checkbox').forEach(chk => {
        chk.addEventListener('change', function() {
            appState.nom_data[this.getAttribute('data-row')].Select = this.checked;
        });
    });

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

    if (!appState.ma_filters) appState.ma_filters = { z: 'All', d: 'All', s: 'All', p: 'All', unit: 'All', remarks: 'All', name: '', rank: appState.cmd_names[0], hideDeployed: false };
    if (appState.ma_filters.p === undefined) appState.ma_filters.p = 'All';
    if (appState.ma_filters.remarks === undefined) appState.ma_filters.remarks = 'All';

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

        if (z && !seen_z.has(z)) { if (sp) addReq(loc_z, appState.cmd_names[0], sp); seen_z.add(z); dutyToHier[loc_z] = {z, d:'', s:'', p:''}; }
        if (d && !seen_d.has(z_key + d)) { if (dysp) addReq(loc_d, appState.cmd_names[1], dysp); seen_d.add(z_key + d); dutyToHier[loc_d] = {z, d, s:'', p:''}; }
        if (s && !seen_s.has(z_key + d + s)) { if (ip) addReq(loc_s, appState.cmd_names[2], ip); seen_s.add(z_key + d + s); dutyToHier[loc_s] = {z, d, s, p:''}; }
        
        if (p) { 
            addReq(loc_p, appState.force_names[0], f1); addReq(loc_p, appState.force_names[1], f2); addReq(loc_p, appState.force_names[2], f3); dutyToHier[loc_p] = {z, d, s, p}; 
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

    const uniqueZones = new Set(); const uniqueDivs = new Set(); const uniqueSecs = new Set(); const uniquePoints = new Set();
    Object.values(dutyToHier).forEach(h => {
        if (h.z) uniqueZones.add(h.z);
        const matchZ = appState.ma_filters.z === 'All' || h.z === appState.ma_filters.z;
        const matchD = appState.ma_filters.d === 'All' || h.d === appState.ma_filters.d;
        const matchS = appState.ma_filters.s === 'All' || h.s === appState.ma_filters.s;
        if (h.d && matchZ) uniqueDivs.add(h.d);
        if (h.s && matchZ && matchD) uniqueSecs.add(h.s);
        if (h.p && matchZ && matchD && matchS) uniquePoints.add(h.p);
    });

    const allRanks = [...appState.cmd_names, ...appState.force_names];
    if (!allRanks.includes(appState.ma_filters.rank)) appState.ma_filters.rank = allRanks[0];
    const selectedRank = appState.ma_filters.rank;

    const availOptions = [];
    const unitUnassignedCounts = {}; // Track unassigned counts per unit for the selected rank
    appState.nom_data.forEach((p, idx) => {
        const pRank = (p['Preferred Rank'] || p['Rank (Raw)'] || "").trim();
        const pDuty = (p['Duty Allocation'] || "").trim();
        if (pRank === selectedRank && (!pDuty || pDuty === "Standby / Reserve")) {
            const u = p.Unit;
            if (u) unitUnassignedCounts[u] = (unitUnassignedCounts[u] || 0) + 1;

            if (appState.ma_filters.unit !== 'All' && p.Unit !== appState.ma_filters.unit) return;
            if (appState.ma_filters.name && !(p.Name || "").toLowerCase().includes(appState.ma_filters.name.toLowerCase())) return;
            
            const remarksText = (p.Remarks || "").trim();
            const isNil = !remarksText || remarksText.toLowerCase() === 'nil' || remarksText.toLowerCase() === 'none' || remarksText === '0';
            if (appState.ma_filters.remarks === 'Filled' && isNil) return;
            if (appState.ma_filters.remarks === 'Nil' && !isNil) return;
            
            availOptions.push({ label: `${p.Name} (Unit: ${p.Unit || 'N/A'}) | Remarks: ${remarksText || "nil"} [${idx}]`, idx });
        }
    });

    let html = `
        <div class="ma-filters">
            <div style="display: flex; gap: 10px; margin-bottom: 15px; align-items: center; flex-wrap: wrap;">
                <select id="ma-z-filter" style="padding: 4px;"><option value="All">Filter Zone (All)</option>${[...uniqueZones].sort().map(z => `<option value="${z}" ${appState.ma_filters.z === z ? 'selected' : ''}>${z}</option>`).join('')}</select>
                <select id="ma-d-filter" style="padding: 4px;"><option value="All">Filter Division (All)</option>${[...uniqueDivs].sort().map(d => `<option value="${d}" ${appState.ma_filters.d === d ? 'selected' : ''}>${d}</option>`).join('')}</select>
                <select id="ma-s-filter" style="padding: 4px;"><option value="All">Filter Sector (All)</option>${[...uniqueSecs].sort().map(s => `<option value="${s}" ${appState.ma_filters.s === s ? 'selected' : ''}>${s}</option>`).join('')}</select>
                <select id="ma-p-filter" style="padding: 4px;"><option value="All">Filter Point (All)</option>${[...uniquePoints].sort().map(p => `<option value="${p}" ${appState.ma_filters.p === p ? 'selected' : ''}>${p}</option>`).join('')}</select>
                <button id="ma-reset-filtered-btn" class="stButton" style="padding: 4px 8px;">🔄 Reset Filtered</button>
                <button id="ma-autofill-btn" class="stButton" style="padding: 4px 8px; background-color: #28a745; color: white; border: none;">⚡ Auto-Fill Filtered</button>
                <label style="display: flex; align-items: center; margin-left: auto; cursor: pointer; font-weight: 600; color: #ef4444;">
                    <input type="checkbox" id="ma-hide-deployed-chk" ${appState.ma_filters.hideDeployed ? 'checked' : ''} style="margin-right: 5px;"> Hide Assigned Duties
                </label>
            </div>
            <div style="display: flex; gap: 10px; margin-bottom: 15px; align-items: center;">
                <select id="ma-unit-filter" style="padding: 4px;"><option value="All">Filter Unit (All)</option>${[...new Set(appState.nom_data.map(p => p.Unit).filter(x=>x))].sort().map(u => `<option value="${u}" ${appState.ma_filters.unit === u ? 'selected' : ''}>${u} (${unitUnassignedCounts[u] || 0} unassigned)</option>`).join('')}</select>
                <select id="ma-remarks-filter" style="padding: 4px;">
                    <option value="All" ${appState.ma_filters.remarks === 'All' ? 'selected' : ''}>Remarks (All)</option>
                    <option value="Filled" ${appState.ma_filters.remarks === 'Filled' ? 'selected' : ''}>Remarks (Filled)</option>
                    <option value="Nil" ${appState.ma_filters.remarks === 'Nil' ? 'selected' : ''}>Remarks (Nil)</option>
                </select>
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
        if (appState.ma_filters.p !== 'All' && h.p !== appState.ma_filters.p) return false;
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
            
            // CONSTRAINTS WARNING HIGHLIGHTING
            const reqCount = reqs[slot.duty] ? reqs[slot.duty][selectedRank] || 0 : 0;
            const assignedCount = assignedByDuty[slot.duty] ? assignedByDuty[slot.duty].length : 0;
            const diff = assignedCount - reqCount;
            
            let rowStyle = "";
            let statusText = `<div style="color:#64748b; font-size:0.85em; margin-top:4px;">[Req: ${reqCount} | Ass: ${assignedCount}]`;
            
            if (diff < 0) { rowStyle = "background-color: #fef2f2;"; statusText += ` <span style="color:#ef4444; font-weight:bold;">(${Math.abs(diff)} Short)</span>`; } 
            else if (diff > 0) { rowStyle = "background-color: #f0fdf4;"; statusText += ` <span style="color:#10b981; font-weight:bold;">(+${diff} Surplus)</span>`; }
            statusText += `</div>`;

            html += `<tr style="${rowStyle}"><td>${selectedRank}</td><td>${slot.duty} ${statusText}</td><td>
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

    container.querySelector('#ma-z-filter').addEventListener('change', e => { appState.ma_filters.z = e.target.value; appState.ma_filters.d = 'All'; appState.ma_filters.s = 'All'; appState.ma_filters.p = 'All'; renderManualAssignment(); });
    container.querySelector('#ma-d-filter').addEventListener('change', e => { appState.ma_filters.d = e.target.value; appState.ma_filters.s = 'All'; appState.ma_filters.p = 'All'; renderManualAssignment(); });
    container.querySelector('#ma-s-filter').addEventListener('change', e => { appState.ma_filters.s = e.target.value; appState.ma_filters.p = 'All'; renderManualAssignment(); });
    container.querySelector('#ma-p-filter').addEventListener('change', e => { appState.ma_filters.p = e.target.value; renderManualAssignment(); });
    container.querySelector('#ma-unit-filter').addEventListener('change', e => { appState.ma_filters.unit = e.target.value; renderManualAssignment(); });
    container.querySelector('#ma-remarks-filter').addEventListener('change', e => { appState.ma_filters.remarks = e.target.value; renderManualAssignment(); });
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
        logAction(`Reset auto-filled filtered rows for rank ${selectedRank}.`);
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
        if (assignedCount > 0) {
            renderManualAssignment();
            logAction(`Auto-filled ${assignedCount} available personnel for rank ${selectedRank}.`);
        }
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
                    const pName = appState.nom_data[nIdx]['Name'] || 'Unknown';
                    logAction(`Assigned 👤 ${pName} to ${duty}.`);
                }
                renderManualAssignment();
            }
        });
    }
}

function getDutyHierarchyMap() {
    const dutyToHier = {};
    let last_z = "", last_d = "", last_s = "";
    appState.scheme_data.forEach((row) => {
        let z = (row['Zone'] || "").trim(), d = (row['Division'] || "").trim(), s = (row['Sector'] || "").trim();
        const p = (row['Point'] || "").trim();
        
        if (z) { last_z = z; last_d = ""; last_s = ""; } else { z = last_z; }
        if (d) { last_d = d; last_s = ""; } else { d = last_d; }
        if (s) { last_s = s; } else { s = last_s; }
        
        const loc_z = z, loc_d = [z, d].filter(x=>x).join(", "), loc_s = [z, d, s].filter(x=>x).join(", "), loc_p = [z, d, s, p].filter(x=>x).join(", ");
        
        if (z && !dutyToHier[loc_z]) dutyToHier[loc_z] = {z, d:'', s:'', p:''};
        if (d && !dutyToHier[loc_d]) dutyToHier[loc_d] = {z, d, s:'', p:''};
        if (s && !dutyToHier[loc_s]) dutyToHier[loc_s] = {z, d, s, p:''};
        if (p && !dutyToHier[loc_p]) dutyToHier[loc_p] = {z, d, s, p};
    });
    return dutyToHier;
}

function updateNominalSummaryFilters() {
    const dutyToHier = getDutyHierarchyMap();
    const uniqueZones = new Set();
    const uniqueDivs = new Set();
    const uniqueSecs = new Set();
    const uniqueUnits = new Set();
    const uniqueRanks = new Set();
    
    Object.values(dutyToHier).forEach(h => {
        if (h.z) uniqueZones.add(h.z);
        if (h.d) uniqueDivs.add(h.d);
        if (h.s) uniqueSecs.add(h.s);
    });
    
    appState.nom_data.forEach(p => {
        if (p.Unit) uniqueUnits.add(p.Unit.trim());
        const r = (p['Preferred Rank'] || p['Rank (Raw)'] || "").trim();
        if (r) uniqueRanks.add(r);
    });

    const populateSelect = (id, label, options, currentVal) => {
        const sel = document.getElementById(id);
        if (!sel) return;
        const val = currentVal || sel.value;
        let html = `<option value="All">${label} (All)</option>`;
        [...options].sort().forEach(o => {
            html += `<option value="${o}" ${val === o ? 'selected' : ''}>${o}</option>`;
        });
        sel.innerHTML = html;
    };
    
    populateSelect('ns-z-filter', 'Filter Zone', uniqueZones);
    populateSelect('ns-d-filter', 'Filter Division', uniqueDivs);
    populateSelect('ns-s-filter', 'Filter Sector', uniqueSecs);
    populateSelect('ns-unit-filter', 'Filter Unit', uniqueUnits);
    populateSelect('ns-rank-filter', 'Filter Rank', uniqueRanks);
}

function generateNominalSummary() {
    const dutyToHier = getDutyHierarchyMap();
    
    const zFilter = document.getElementById('ns-z-filter').value;
    const dFilter = document.getElementById('ns-d-filter').value;
    const sFilter = document.getElementById('ns-s-filter').value;
    const unitFilter = document.getElementById('ns-unit-filter').value;
    const rankFilter = document.getElementById('ns-rank-filter').value;
    const statusFilter = document.getElementById('ns-status-filter').value;
    
    let filteredData = appState.nom_data.filter(p => {
        const duty = (p['Duty Allocation'] || "").trim();
        const r = (p['Preferred Rank'] || p['Rank (Raw)'] || "").trim();
        const u = (p.Unit || "").trim();
        
        if (unitFilter !== 'All' && u !== unitFilter) return false;
        if (rankFilter !== 'All' && r !== rankFilter) return false;
        
        const isUnassigned = !duty || duty === "Standby / Reserve";
        if (statusFilter === 'Assigned' && isUnassigned) return false;
        if (statusFilter === 'Unassigned' && !isUnassigned) return false;
        
        if (!isUnassigned) {
            const h = dutyToHier[duty] || {z: '', d: '', s: '', p: ''};
            if (zFilter !== 'All' && h.z !== zFilter) return false;
            if (dFilter !== 'All' && h.d !== dFilter) return false;
            if (sFilter !== 'All' && h.s !== sFilter) return false;
        } else {
            if (zFilter !== 'All' || dFilter !== 'All' || sFilter !== 'All') return false;
        }
        
        return true;
    });
    
    appState.ns_filtered_data = filteredData;
    
    const container = document.getElementById('nominal-summary-container');
    if (!container) return;
    
    if (filteredData.length === 0) {
        container.innerHTML = "<p>No personnel match the selected filters.</p>";
        return;
    }
    
    const headers = ["Sl No", "Name", "Preferred Rank", "GL Number", "PEN", "Unit", "Mobile", "Duty Allocation"];
    let table = '<div class="table-container"><table class="data-grid"><thead><tr>';
    headers.forEach(h => table += `<th>${h}</th>`);
    table += '</tr></thead><tbody>';
    
    filteredData.forEach(row => {
        table += '<tr>';
        headers.forEach(h => {
            table += `<td>${row[h] || ''}</td>`;
        });
        table += '</tr>';
    });
    table += '</tbody></table></div>';
    
    const summaryCount = {};
    const unitSummary = {}; // Track unit-wise rank totals

    filteredData.forEach(p => {
        const r = (p['Preferred Rank'] || p['Rank (Raw)'] || "").trim() || "Unranked";
        const u = (p.Unit || "").trim() || "Unknown Unit";
        summaryCount[r] = (summaryCount[r] || 0) + 1;
        
        if (!unitSummary[u]) unitSummary[u] = {};
        unitSummary[u][r] = (unitSummary[u][r] || 0) + 1;
    });

    const definedRanks = [...appState.cmd_names, ...appState.force_names];
    const allRanksFound = Object.keys(summaryCount).sort((a, b) => {
        let idxA = definedRanks.indexOf(a);
        let idxB = definedRanks.indexOf(b);
        if (idxA === -1) idxA = 999;
        if (idxB === -1) idxB = 999;
        if (idxA !== idxB) return idxA - idxB;
        return a.localeCompare(b);
    });
    
    let countHtml = '<div style="margin-bottom: 10px; display: flex; gap: 10px; flex-wrap: wrap;">';
    countHtml += `<div style="background: #e2e8f0; padding: 6px 12px; border-radius: 4px; font-weight: bold;">Total Personnel: ${filteredData.length}</div>`;
    allRanksFound.forEach(r => {
        countHtml += `<div style="background: #f1f5f9; padding: 6px 12px; border-radius: 4px;">${r}: ${summaryCount[r]}</div>`;
    });
    countHtml += '</div>';
    
    let unitTable = '<div style="margin-bottom: 20px;"><h4 style="margin-top: 15px; margin-bottom: 10px;">📊 Unit-wise Rank Summary</h4><div class="table-container" style="max-height: 300px;"><table class="data-grid" style="width: max-content;"><thead><tr><th>Unit</th>';
    allRanksFound.forEach(r => unitTable += `<th>${r}</th>`);
    unitTable += '<th>Total</th></tr></thead><tbody>';
    
    Object.keys(unitSummary).sort().forEach(u => {
        unitTable += `<tr><td style="font-weight: bold;">${u}</td>`;
        let rowTotal = 0;
        allRanksFound.forEach(r => {
            const count = unitSummary[u][r] || 0;
            rowTotal += count;
            unitTable += `<td style="text-align: center;">${count || ''}</td>`;
        });
        unitTable += `<td style="font-weight: bold; text-align: center;">${rowTotal}</td></tr>`;
    });
    
    // Total Row
    unitTable += '<tr style="background-color: #f1f5f9;"><td style="font-weight: bold;">GRAND TOTAL</td>';
    let grandTotal = 0;
    allRanksFound.forEach(r => {
        unitTable += `<td style="font-weight: bold; text-align: center;">${summaryCount[r] || 0}</td>`;
        grandTotal += summaryCount[r] || 0;
    });
    unitTable += `<td style="font-weight: bold; text-align: center;">${grandTotal}</td></tr>`;
    unitTable += '</tbody></table></div></div>';
    
    container.innerHTML = countHtml + unitTable + '<h4 style="margin-top: 15px; margin-bottom: 10px;">📋 Filtered Personnel List</h4>' + table;
    container.querySelectorAll('table').forEach(tbl => makeTableResizable(tbl));
}

function updateNominalViews() {
    renderNominalTable('nom-editor-container');
    renderManualAssignment();
    updateTallyDashboard();
    updateNominalSummaryFilters();
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

function sortScheme() { postSchemeAction('/api/sort-scheme'); logAction("Sorted Scheme rows by Zone/Div."); }
function addBlankRows() {
    saveSchemeState();
    const headers = getSchemeHeaders();
    for (let i = 0; i < 10; i++) { const row = { Select: false }; headers.forEach(h => row[h] = ""); appState.scheme_data.push(row); }
    renderSchemeTable();
    logAction("Added 10 blank scheme rows.");
}

function addOneRow() {
    saveSchemeState();
    const headers = getSchemeHeaders();
    const row = { Select: false };
    headers.forEach(h => row[h] = "");
    appState.scheme_data.push(row);
    renderSchemeTable();
    logAction("Added 1 blank scheme row.");
}

function deleteSelectedRows() {
    const selectedIndices = getSelectedIndices();
    if (selectedIndices.length === 0) return alert("Select rows first by checking the boxes!");
    if (!confirm(`Are you sure you want to delete ${selectedIndices.length} row(s)?`)) return;
    
    saveSchemeState();
    appState.scheme_data = appState.scheme_data.filter((_, idx) => !selectedIndices.includes(idx));
    renderSchemeTable();
    logAction(`Deleted ${selectedIndices.length} scheme rows.`);
}

function insertRow(above) {
    const selectedIndices = getSelectedIndices();
    if (selectedIndices.length !== 1) return alert("Please select exactly ONE row to insert relative to!");
    
    saveSchemeState();
    const targetIdx = selectedIndices[0];
    const headers = getSchemeHeaders();
    const row = { Select: false };
    headers.forEach(h => row[h] = "");
    
    const insertIdx = above ? targetIdx : targetIdx + 1;
    appState.scheme_data.splice(insertIdx, 0, row);
    
    // Clear selection
    appState.scheme_data.forEach(r => r.Select = false);
    
    renderSchemeTable();
    logAction(`Inserted 1 row ${above ? 'above' : 'below'} row ${targetIdx + 1}.`);
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
    logAction(`Cloned ${selectedIndices.length} rows at ${level} level.`);
}

function groupSelected(level) {
    const selectedIndices = getSelectedIndices();
    if (selectedIndices.length === 0) return alert("Select rows first by checking the boxes!");
    const name = prompt(`Enter ${level} Name:`, "");
    if (!name) return;
    postSchemeAction('/api/group-rows', { selected_indices: selectedIndices, level, name });
    logAction(`Grouped ${selectedIndices.length} rows into ${level}: ${name}.`);
}

function duplicateSelected() {
    const selectedIndices = getSelectedIndices();
    if (selectedIndices.length === 0) return alert("Select rows first by checking the boxes!");
    const copies = parseInt(prompt("Number of copies:", "1")) || 1;
    postSchemeAction('/api/duplicate-rows', { selected_indices: selectedIndices, copies });
    logAction(`Duplicated ${selectedIndices.length} rows (${copies} copies).`);
}

function fillDownSelected() {
    const selectedIndices = getSelectedIndices();
    if (selectedIndices.length === 0) return alert("Select rows first by checking the boxes!");
    const colsStr = prompt("Columns to fill down (comma-separated):", appState.force_names.join(", "));
    if (!colsStr) return;
    postSchemeAction('/api/fill-down', { selected_indices: selectedIndices, columns: colsStr.split(',').map(c => c.trim()) });
    logAction(`Filled down columns for ${selectedIndices.length} rows.`);
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
        renderSchemeTable(); alert("Scheme Loaded!"); logAction("Uploaded new Scheme Excel file.");
    } catch(error) { alert("Error loading Excel file."); undoScheme(); }
    fileInput.value = "";
}

// --- Smart Mapper Configuration ---
const REQUIRED_NOM_HEADERS = ["Sl No", "Name", "Rank (Raw)", "GL Number", "PEN", "Unit", "Mobile", "Remarks"];
let rawUploadDataCache = null;

async function uploadNominalExcel(fileInput) {
    if (!fileInput.files.length) return;
    const formData = new FormData();
    formData.append('file', fileInput.files[0]);
    saveNomState();
    try {
        const response = await fetch('/api/upload-nominal', { method: 'POST', body: formData });
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const resData = await response.json();
        
        let exactMatch = true;
        REQUIRED_NOM_HEADERS.forEach(h => { if (!resData.raw_columns.includes(h)) exactMatch = false; });
        
        if (exactMatch) {
            let mapped = resData.raw_data.map(r => {
                const newRow = {};
                REQUIRED_NOM_HEADERS.forEach(h => newRow[h] = r[h] || "");
                newRow["Preferred Rank"] = r["Preferred Rank"] || "";
                newRow["Duty Allocation"] = r["Duty Allocation"] || "";
                newRow["Assignment Type"] = r["Assignment Type"] || "";
                return newRow;
            });
            mergeNominalData(mapped);
        } else {
            rawUploadDataCache = resData.raw_data;
            showMapperModal(resData.raw_columns);
        }
    } catch(error) { alert("Error loading Excel file."); undoNom(); }
    fileInput.value = "";
}

function showMapperModal(excelCols) {
    const tbody = document.getElementById('mapper-table-body').querySelector('tbody');
    let html = '';
    REQUIRED_NOM_HEADERS.forEach(reqH => {
        html += `<tr><td><strong>${reqH}</strong></td><td><select class="mapper-select" data-req="${reqH}" style="padding:4px; width: 100%;">`;
        html += `<option value="">-- Leave Blank / Ignore --</option>`;
        excelCols.forEach(ec => {
            const isMatch = ec.toLowerCase().replace(/[^a-z0-9]/g, '') === reqH.toLowerCase().replace(/[^a-z0-9]/g, '');
            html += `<option value="${ec}" ${isMatch ? 'selected' : ''}>${ec}</option>`;
        });
        html += `</select></td></tr>`;
    });
    tbody.innerHTML = html;
    document.getElementById('mapper-modal').style.display = 'block';
}

function applyColumnMapping() {
    if (!rawUploadDataCache) return;
    const mapping = {};
    document.querySelectorAll('.mapper-select').forEach(sel => { mapping[sel.getAttribute('data-req')] = sel.value; });
    
    let mapped = rawUploadDataCache.map(r => {
        const newRow = {};
        REQUIRED_NOM_HEADERS.forEach(h => {
            const sourceCol = mapping[h];
            newRow[h] = sourceCol ? (r[sourceCol] || "") : "";
        });
        newRow["Preferred Rank"] = r["Preferred Rank"] || "";
        newRow["Duty Allocation"] = r["Duty Allocation"] || "";
        newRow["Assignment Type"] = r["Assignment Type"] || "";
        return newRow;
    });
    document.getElementById('mapper-modal').style.display = 'none';
    mergeNominalData(mapped);
}

function mergeNominalData(mappedData) {
    if (appState.nom_data && appState.nom_data.length > 0) appState.nom_data = appState.nom_data.concat(mappedData);
    else appState.nom_data = mappedData;
    updateNominalViews(); alert("Nominal Roll Loaded!"); logAction(`Imported ${mappedData.length} records into Nominal Roll.`);
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

function getNomSelectedIndices() { return appState.nom_data.map((row, idx) => row.Select ? idx : -1).filter(idx => idx !== -1); }

function deleteNominalSelectedRows() {
    const selectedIndices = getNomSelectedIndices();
    if (selectedIndices.length === 0) return alert("Select rows first by checking the boxes!");
    if (!confirm(`Are you sure you want to delete ${selectedIndices.length} row(s)?`)) return;
    
    saveNomState();
    appState.nom_data = appState.nom_data.filter((_, idx) => !selectedIndices.includes(idx));
    updateNominalViews();
    logAction(`Deleted ${selectedIndices.length} nominal roll rows.`);
}

function addNominalRow() {
    saveNomState();
    const headers = ["Sl No", "Name", "Rank (Raw)", "GL Number", "PEN", "Unit", "Mobile", "Remarks", "Preferred Rank", "Duty Allocation", "Assignment Type"];
    const row = { Select: false };
    headers.forEach(h => row[h] = "");
    if (!appState.nom_data) appState.nom_data = [];
    appState.nom_data.push(row);
    updateNominalViews();
    logAction("Added 1 blank nominal roll row.");
}

function cleanRanks() { postNomAction('/api/clean-ranks'); logAction("Cleaned and assigned preferred ranks."); }
function autoAllocate() { postNomAction('/api/auto-allocate'); logAction("Executed strict Auto-Allocation."); }
function qrtSweep() { postNomAction('/api/qrt-sweep'); logAction("Swept unassigned personnel to Standby/Reserve."); }
function resetAuto() { saveNomState(); appState.nom_data.forEach(row => { if (row['Assignment Type'] === 'Auto') { row['Duty Allocation'] = ""; row['Assignment Type'] = ""; } }); updateNominalViews(); alert("Auto allocations reset!"); logAction("Reset all Auto-Allocations."); }
function resetAll() { saveNomState(); appState.nom_data.forEach(row => { row['Duty Allocation'] = ""; row['Assignment Type'] = ""; }); updateNominalViews(); alert("All allocations reset!"); logAction("Reset ALL duty allocations."); }

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
    if (tabName === 'tab4' || tabName === 'tab5' || tabName === 'tab8') updateNominalViews();
}

function bindIfExists(id, event, handler) { const el = document.getElementById(id); if (el) el.addEventListener(event, handler); }

document.addEventListener('DOMContentLoaded', () => {
    initializeState();
    renderSchemeTable();

    bindIfExists('scheme-heading-input', 'input', e => appState.scheme_heading = e.target.value);
    bindIfExists('scheme-date-input', 'input', e => appState.scheme_date = e.target.value);
    bindIfExists('scheme-conclusion-input', 'input', e => appState.scheme_conclusion = e.target.value);

    bindIfExists('show-log-btn', 'click', () => document.getElementById('log-modal').style.display = 'block');
    bindIfExists('apply-mapping-btn', 'click', applyColumnMapping);

    bindIfExists('theme-select', 'change', e => {
        appState.theme = e.target.value;
        const panel = document.getElementById('custom-theme-panel');
        if (appState.theme === "Custom") panel.style.display = "flex";
        else panel.style.display = "none";
        renderSchemeTable();
    });

    // Bind custom color pickers to appState
    ['z', 'zf', 'd', 'df', 's', 'sf', 'gt', 'zt', 'st', 'p'].forEach(key => {
        const el = document.getElementById(`ct-${key}`);
        if (el) el.addEventListener('input', (e) => {
            appState.custom_theme[key] = e.target.value;
            if (appState.theme === "Custom") renderSchemeTable();
        });
    });

    bindIfExists('align-scheme-btn', 'click', alignScheme);
    bindIfExists('get-totals-btn', 'click', getManpowerTotals);
    bindIfExists('get-readable-btn', 'click', getReadableScheme);
    bindIfExists('get-deployed-btn', 'click', getDeployedData);
    bindIfExists('sort-scheme-btn', 'click', sortScheme);
    bindIfExists('add-blank-rows-btn', 'click', addBlankRows);
    bindIfExists('add-one-row-btn', 'click', addOneRow);
    bindIfExists('delete-selected-btn', 'click', deleteSelectedRows);
    bindIfExists('insert-row-above-btn', 'click', () => insertRow(true));
    bindIfExists('insert-row-below-btn', 'click', () => insertRow(false));
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

    bindIfExists('add-nom-row-btn', 'click', addNominalRow);
    bindIfExists('delete-nom-selected-btn', 'click', deleteNominalSelectedRows);
    bindIfExists('clean-ranks-btn', 'click', cleanRanks);
    bindIfExists('find-dupes-btn', 'click', findDuplicates);
    bindIfExists('auto-allocate-btn', 'click', autoAllocate);
    bindIfExists('qrt-sweep-btn', 'click', qrtSweep);
    bindIfExists('reset-auto-btn', 'click', resetAuto);
    bindIfExists('reset-all-btn', 'click', resetAll);

    const nomUnassignedChk = document.getElementById('nom-unassigned-filter-chk');
    if (nomUnassignedChk) {
        nomUnassignedChk.addEventListener('change', function() {
            appState.nom_unassigned_only = this.checked;
            renderNominalTable('nom-editor-container');
        });
    }

    bindIfExists('ns-generate-btn', 'click', generateNominalSummary);
    bindIfExists('dl-ns-xls-btn', 'click', () => {
        if (!appState.ns_filtered_data || appState.ns_filtered_data.length === 0) {
            alert("No data to export. Generate summary first.");
            return;
        }
        const filters = {
            zone: document.getElementById('ns-z-filter').value,
            division: document.getElementById('ns-d-filter').value,
            sector: document.getElementById('ns-s-filter').value,
            unit: document.getElementById('ns-unit-filter').value,
            rank: document.getElementById('ns-rank-filter').value,
            status: document.getElementById('ns-status-filter').value
        };
        downloadBlob('/api/download/nom-summary', {
            nom_data: appState.ns_filtered_data,
            theme: appState.theme,
            custom_theme: appState.custom_theme,
            cmd_names: appState.cmd_names,
            force_names: appState.force_names,
            filters: filters
        }, 'Filtered_Nominal_Summary.xlsx');
    });

    // --- GLOBAL SETTINGS & PROJECT LOAD/SAVE BINDINGS ---
    bindIfExists('save-settings-btn', 'click', () => {
        appState.theme = document.getElementById('theme-select').value;
        appState.cmd_names = [document.getElementById('cmd-z').value, document.getElementById('cmd-d').value, document.getElementById('cmd-s').value];
        appState.force_names = [document.getElementById('f-1').value, document.getElementById('f-2').value, document.getElementById('f-3').value];
        renderSchemeTable(); updateNominalViews(); alert("Settings saved!");
    });

    async function saveProject(saveAs = false) {
        const projData = JSON.stringify(appState);
        try {
            if (window.showSaveFilePicker) {
                if (saveAs || !currentFileHandle) {
                    const options = {
                        suggestedName: 'My_Scheme.scproj',
                        types: [{ description: 'Scheme Creator Project', accept: {'application/json': ['.scproj']} }],
                    };
                    currentFileHandle = await window.showSaveFilePicker(options);
                }
                const writable = await currentFileHandle.createWritable();
                await writable.write(projData);
                await writable.close();
                logAction(`Saved Project to ${currentFileHandle.name}.`);
                alert("Project saved successfully!");
            } else {
                // Fallback for older browsers
                const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(projData);
                const a = document.createElement('a');
                a.setAttribute("href", dataStr);
                a.setAttribute("download", "My_Scheme.scproj");
                a.click();
                logAction("Saved Project file (.scproj).");
            }
        } catch (error) {
            console.error(error);
            if (error.name !== 'AbortError') alert("Failed to save project.");
        }
    }

    bindIfExists('save-proj-btn', 'click', () => saveProject(false));
    bindIfExists('save-as-proj-btn', 'click', () => saveProject(true));

    function loadProjectFromFile(file) {
        const reader = new FileReader();
        reader.onload = function(evt) {
            try {
                const loaded = JSON.parse(evt.target.result);
                
                // Explicitly overwrite state to prevent array merging glitches
                appState.cmd_names = loaded.cmd_names || ["SP", "DySP", "IP"];
                appState.force_names = loaded.force_names || ["SI/ASI", "SCPO/CPO", "WSCPO/WCPO"];
                appState.scheme_data = loaded.scheme_data || [];
                appState.nom_data = loaded.nom_data || [];
                appState.scheme_filter = loaded.scheme_filter || { z: null, d: null, s: null };
                appState.theme = loaded.theme || "Default Blue";
                if (loaded.custom_theme) appState.custom_theme = loaded.custom_theme;
                if (loaded.logs) appState.logs = loaded.logs;
                appState.scheme_undo = loaded.scheme_undo || [];
                appState.scheme_redo = loaded.scheme_redo || [];
                appState.nom_undo = loaded.nom_undo || [];
                appState.nom_redo = loaded.nom_redo || [];
                appState.colWidths = loaded.colWidths || {};
                appState.ma_filters = loaded.ma_filters || null;
                appState.scheme_heading = loaded.scheme_heading || "";
                appState.scheme_date = loaded.scheme_date || "";
                appState.scheme_conclusion = loaded.scheme_conclusion || "";
                appState.nom_filters = loaded.nom_filters || {};
                appState.nom_unassigned_only = loaded.nom_unassigned_only || false;

                const nomUnassignedChk = document.getElementById('nom-unassigned-filter-chk');
                if (nomUnassignedChk) nomUnassignedChk.checked = appState.nom_unassigned_only;

                const hInput = document.getElementById('scheme-heading-input'); if (hInput) hInput.value = appState.scheme_heading;
                const dInput = document.getElementById('scheme-date-input'); if (dInput) dInput.value = appState.scheme_date;
                const cInput = document.getElementById('scheme-conclusion-input'); if (cInput) cInput.value = appState.scheme_conclusion;

                document.getElementById('theme-select').value = appState.theme || "Default Blue";
                document.getElementById('cmd-z').value = appState.cmd_names[0]; document.getElementById('cmd-d').value = appState.cmd_names[1]; document.getElementById('cmd-s').value = appState.cmd_names[2];
                document.getElementById('f-1').value = appState.force_names[0]; document.getElementById('f-2').value = appState.force_names[1]; document.getElementById('f-3').value = appState.force_names[2];
                
                const panel = document.getElementById('custom-theme-panel');
                if (appState.theme === "Custom") panel.style.display = "flex"; else panel.style.display = "none";
                ['z', 'zf', 'd', 'df', 's', 'sf', 'gt', 'zt', 'st', 'p'].forEach(key => { const el = document.getElementById(`ct-${key}`); if (el) el.value = appState.custom_theme[key]; });

                renderSchemeTable(); 
                updateNominalViews(); 
                logAction("Loaded project state from file.");
                
                // Clear stale generated reports from any previous session
                ['manpower-totals-container', 'readable-scheme-container', 'deployed-sheet-container', 'matrix-sheet-container'].forEach(id => {
                    const el = document.getElementById(id); if(el) el.innerHTML = "";
                });

                alert("Project loaded successfully! You can resume from where you left off.");
            } catch(err) { console.error(err); alert("Failed to parse project file."); }
        };
        reader.readAsText(file);
    }

    bindIfExists('load-proj-btn', 'click', async () => {
        if (window.showOpenFilePicker) {
            try {
                const [fileHandle] = await window.showOpenFilePicker({
                    types: [{ description: 'Scheme Creator Project', accept: {'application/json': ['.scproj']} }],
                });
                const file = await fileHandle.getFile();
                currentFileHandle = fileHandle;
                loadProjectFromFile(file);
            } catch (error) {
                if (error.name !== 'AbortError') { console.error(error); alert("Failed to load project."); }
            }
        } else {
            document.getElementById('load-proj-input').click();
        }
    });

    bindIfExists('load-proj-input', 'change', function(e) {
        const file = e.target.files[0];
        if (!file) return;
        loadProjectFromFile(file);
        e.target.value = ""; // Reset
    });

    // --- DOWNLOAD BINDINGS ---
    bindIfExists('dl-raw-btn', 'click', () => downloadBlob('/api/download/raw-scheme', {scheme_data: appState.scheme_data}, 'Raw_Scheme.xlsx'));
    bindIfExists('dl-totals-btn', 'click', () => downloadBlob('/api/download/totals', {scheme_data: appState.scheme_data, cmd_names: appState.cmd_names, force_names: appState.force_names, theme: appState.theme, custom_theme: appState.custom_theme}, 'Manpower_Totals.xlsx'));
    bindIfExists('dl-readable-xls', 'click', () => downloadBlob('/api/download/readable-excel', {scheme_data: appState.scheme_data, cmd_names: appState.cmd_names, force_names: appState.force_names, theme: appState.theme, custom_theme: appState.custom_theme, heading: appState.scheme_heading, date: appState.scheme_date}, 'Readable_Scheme.xlsx'));
    bindIfExists('dl-readable-pdf', 'click', () => downloadBlob('/api/download/readable-html', {scheme_data: appState.scheme_data, cmd_names: appState.cmd_names, force_names: appState.force_names, theme: appState.theme, custom_theme: appState.custom_theme, heading: appState.scheme_heading, date: appState.scheme_date}, 'Readable_Scheme.html'));
    
    bindIfExists('t4-undo-btn', 'click', undoNom);
    bindIfExists('t4-redo-btn', 'click', redoNom);
    bindIfExists('dl-nom-template-btn', 'click', () => downloadBlob('/api/download/nom-template', {}, 'Blank_Roster_Template.xlsx'));
    bindIfExists('dl-nom-roll-btn', 'click', () => downloadBlob('/api/download/nom-roll', {nom_data: appState.nom_data}, 'Nominal_Roll.xlsx'));
    bindIfExists('dl-nom-unassigned-btn', 'click', () => {
        const unassigned = appState.nom_data.filter(p => {
            const duty = (p['Duty Allocation'] || "").trim();
            return !duty || duty === "Standby / Reserve";
        });
        if(unassigned.length === 0) return alert("No unassigned personnel found!");
        downloadBlob('/api/download/nom-roll', {nom_data: unassigned}, 'Unassigned_Personnel.xlsx');
    });
    
    bindIfExists('dl-nom-assigned-btn', 'click', () => {
        const assigned = appState.nom_data.filter(p => {
            const duty = (p['Duty Allocation'] || "").trim();
            return duty && duty !== "Standby / Reserve";
        });
        if(assigned.length === 0) return alert("No assigned personnel found!");
        downloadBlob('/api/download/nom-roll', {nom_data: assigned}, 'Assigned_Personnel.xlsx');
    });

    bindIfExists('dl-dep-xls-full', 'click', () => downloadBlob('/api/download/deployed-excel', {scheme_data: appState.scheme_data, nom_data: appState.nom_data, cmd_names: appState.cmd_names, force_names: appState.force_names, theme: appState.theme, custom_theme: appState.custom_theme, mode: 'full', heading: appState.scheme_heading, date: appState.scheme_date, conclusion: appState.scheme_conclusion}, 'Deployed_Sheet.xlsx'));
    bindIfExists('dl-dep-xls-zone', 'click', () => downloadBlob('/api/download/deployed-excel', {scheme_data: appState.scheme_data, nom_data: appState.nom_data, cmd_names: appState.cmd_names, force_names: appState.force_names, theme: appState.theme, custom_theme: appState.custom_theme, mode: 'zone_sheets', heading: appState.scheme_heading, date: appState.scheme_date, conclusion: appState.scheme_conclusion}, 'Deployed_Zones.xlsx'));
    bindIfExists('dl-dep-html', 'click', () => downloadBlob('/api/download/deployed-html', {scheme_data: appState.scheme_data, nom_data: appState.nom_data, cmd_names: appState.cmd_names, force_names: appState.force_names, theme: appState.theme, custom_theme: appState.custom_theme, heading: appState.scheme_heading, date: appState.scheme_date, conclusion: appState.scheme_conclusion}, 'Deployed_Report.html'));

    bindIfExists('dl-mat-xls-full', 'click', () => downloadBlob('/api/download/matrix-excel', {scheme_data: appState.scheme_data, nom_data: appState.nom_data, cmd_names: appState.cmd_names, force_names: appState.force_names, theme: appState.theme, custom_theme: appState.custom_theme, mode: 'full', heading: appState.scheme_heading, date: appState.scheme_date, conclusion: appState.scheme_conclusion}, 'Matrix_Sheet.xlsx'));
    bindIfExists('dl-mat-xls-zone', 'click', () => downloadBlob('/api/download/matrix-excel', {scheme_data: appState.scheme_data, nom_data: appState.nom_data, cmd_names: appState.cmd_names, force_names: appState.force_names, theme: appState.theme, custom_theme: appState.custom_theme, mode: 'zone_sheets', heading: appState.scheme_heading, date: appState.scheme_date, conclusion: appState.scheme_conclusion}, 'Matrix_Zones.xlsx'));
    bindIfExists('dl-mat-html', 'click', () => downloadBlob('/api/download/matrix-html', {scheme_data: appState.scheme_data, nom_data: appState.nom_data, cmd_names: appState.cmd_names, force_names: appState.force_names, theme: appState.theme, custom_theme: appState.custom_theme, heading: appState.scheme_heading, date: appState.scheme_date, conclusion: appState.scheme_conclusion}, 'Matrix_Report.html'));
});
