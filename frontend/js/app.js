/**
 * EasyInsure — Frontend Application Logic
 * Workflow: Register Assets → Insure (Policy) → Claim → Process → Approve/Reject
 */

let currentUser = null;
let currentClaimId = null;
let currentAssetId = null;
let claimsData = [];
let assetsData = [];

// ── Initialization ──
document.addEventListener('DOMContentLoaded', () => {
    setupEventListeners();
    checkAuth();
});

function setupEventListeners() {
    document.getElementById('login-form').addEventListener('submit', handleLogin);
    document.getElementById('logout-btn').addEventListener('click', handleLogout);

    document.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const page = e.target.closest('.nav-link').dataset.page;
            navigateTo(page);
        });
    });

    document.getElementById('new-asset-form').addEventListener('submit', handleRegisterAsset);
    document.getElementById('new-claim-form').addEventListener('submit', handleSubmitClaim);
    document.getElementById('new-policy-form').addEventListener('submit', handleCreatePolicy);
    document.getElementById('risk-form').addEventListener('submit', handleCalculateRisk);
    document.getElementById('depreciation-form').addEventListener('submit', handleCalculateDepreciation);
    document.getElementById('reject-form').addEventListener('submit', handleRejectClaim);

    document.getElementById('filter-status').addEventListener('change', filterClaims);
    document.getElementById('filter-tier').addEventListener('change', filterClaims);
    document.getElementById('filter-asset-type').addEventListener('change', filterAssets);
    document.getElementById('filter-insured').addEventListener('change', filterAssets);
}

// ── Auth ──
async function checkAuth() {
    if (api.token) {
        try {
            currentUser = await api.getMe();
            showApp();
        } catch {
            api.clearToken();
            showLogin();
        }
    } else {
        showLogin();
    }
}

async function handleLogin(e) {
    e.preventDefault();
    const username = document.getElementById('login-username').value;
    const password = document.getElementById('login-password').value;
    try {
        const data = await api.login(username, password);
        api.setToken(data.access_token);
        currentUser = await api.getMe();
        showApp();
        toast('Logged in successfully', 'success');
    } catch (err) {
        toast(err.message || 'Login failed', 'error');
    }
}

function handleLogout() {
    api.clearToken();
    currentUser = null;
    showLogin();
}

function showLogin() {
    document.getElementById('login-screen').classList.add('active');
    document.getElementById('app-shell').classList.remove('active');
}

function showApp() {
    document.getElementById('login-screen').classList.remove('active');
    document.getElementById('app-shell').classList.add('active');
    if (currentUser) {
        document.getElementById('user-display').textContent = currentUser.username;
        document.getElementById('user-role-badge').textContent = currentUser.role;
        if (currentUser.role === 'superuser') {
            document.getElementById('nav-users').style.display = '';
        }
    }
    navigateTo('dashboard');
}

// ── Navigation ──
function navigateTo(page) {
    document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
    const activeLink = document.querySelector(`[data-page="${page}"]`);
    if (activeLink) activeLink.classList.add('active');

    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    const targetPage = document.getElementById(`page-${page}`);
    if (targetPage) targetPage.classList.add('active');

    const titles = {
        dashboard: 'Dashboard',
        assets: 'My Assets',
        'asset-detail': 'Asset Details',
        claims: 'Claims Management',
        'claim-detail': 'Claim Details',
        policies: 'Policies',
        tools: 'Calculation Tools',
        reports: 'Reports',
        users: 'User Management',
    };
    document.getElementById('page-title').textContent = titles[page] || page;

    if (page === 'dashboard') loadDashboard();
    if (page === 'assets') loadAssets();
    if (page === 'claims') loadClaims();
    if (page === 'policies') loadPolicies();
    if (page === 'tools') loadToolAssets();
}

// ── Dashboard ──
async function loadDashboard() {
    try {
        const [assets, claims] = await Promise.all([api.getAssets(), api.getClaims()]);
        assetsData = assets;
        claimsData = claims;

        document.getElementById('stat-total-assets').textContent = assets.length;
        document.getElementById('stat-insured').textContent = assets.filter(a => a.insured).length;
        document.getElementById('stat-pending').textContent =
            claims.filter(c => ['submitted', 'processing', 'reviewed'].includes(c.status)).length;
        document.getElementById('stat-flagged').textContent =
            claims.filter(c => c.fraud_flag).length;

        // Portfolio summary
        const totalPurchase = assets.reduce((s, a) => s + a.purchase_price, 0);
        const totalCurrent = assets.reduce((s, a) => s + a.current_value, 0);
        const totalChange = totalCurrent - totalPurchase;
        const changePct = totalPurchase > 0 ? ((totalChange / totalPurchase) * 100).toFixed(1) : 0;

        document.getElementById('dashboard-portfolio').innerHTML = `
            <div class="result-item"><span>Total Purchase Value</span><span>R${formatNumber(totalPurchase)}</span></div>
            <div class="result-item"><span>Current Portfolio Value</span><strong>R${formatNumber(totalCurrent)}</strong></div>
            <div class="result-item"><span>Total Change</span>
                <span class="${totalChange >= 0 ? 'text-success' : 'text-danger'}">
                    R${formatNumber(totalChange)} (${changePct}%)
                </span>
            </div>
            <div class="result-item"><span>Insured Assets</span><span>${assets.filter(a => a.insured).length} / ${assets.length}</span></div>
        `;

        // Recent claims table
        const tbody = document.getElementById('dashboard-claims-table');
        if (claims.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted">No claims yet</td></tr>';
            return;
        }
        tbody.innerHTML = claims.slice(0, 8).map(c => `
            <tr onclick="viewClaim(${c.id})" style="cursor:pointer">
                <td>${c.claim_number}</td>
                <td>${c.asset_description || c.claim_type}</td>
                <td>${c.amount_requested ? 'R' + formatNumber(c.amount_requested) : '—'}</td>
                <td><span class="badge badge-${c.status}">${c.status}</span></td>
            </tr>
        `).join('');
    } catch (err) {
        console.error('Dashboard load error:', err);
    }
}

// ── Assets (Portfolio View) ──
async function loadAssets() {
    try {
        assetsData = await api.getAssets();
        renderAssets(assetsData);
    } catch (err) {
        console.error('Assets load error:', err);
    }
}

function renderAssets(assets) {
    const grid = document.getElementById('assets-grid');
    if (assets.length === 0) {
        grid.innerHTML = '<p class="text-muted">No assets registered yet. Click "+ Register Asset" to add your first asset.</p>';
        return;
    }

    grid.innerHTML = assets.map(a => {
        const label = a.make && a.model ? `${a.make} ${a.model}` : (a.description || a.asset_type);
        const changeClass = a.value_change >= 0 ? 'text-success' : 'text-danger';
        const changeIcon = a.value_change >= 0 ? '▲' : '▼';
        return `
            <div class="asset-card ${a.insured ? 'insured' : 'uninsured'}" onclick="viewAsset(${a.id})">
                <div class="asset-card-header">
                    <span class="asset-type-icon">${getAssetIcon(a.asset_type)}</span>
                    <span class="badge ${a.insured ? 'badge-approved' : 'badge-submitted'}">${a.insured ? 'Insured' : 'Uninsured'}</span>
                </div>
                <h4>${escapeHtml(label)}</h4>
                <div class="asset-card-values">
                    <div class="asset-value-row">
                        <span class="text-muted">Purchase</span>
                        <span>R${formatNumber(a.purchase_price)}</span>
                    </div>
                    <div class="asset-value-row">
                        <span class="text-muted">Current</span>
                        <strong>R${formatNumber(a.current_value)}</strong>
                    </div>
                    <div class="asset-value-row">
                        <span class="text-muted">Change</span>
                        <span class="${changeClass}">${changeIcon} ${Math.abs(a.value_change_pct)}%</span>
                    </div>
                </div>
                <div class="asset-card-footer">
                    <span class="text-muted">${a.asset_type} · ${a.condition}</span>
                    <span class="text-muted">${(a.depreciation_rate * 100).toFixed(0)}%/yr</span>
                </div>
            </div>
        `;
    }).join('');
}

function filterAssets() {
    const type = document.getElementById('filter-asset-type').value;
    const insured = document.getElementById('filter-insured').value;
    let filtered = assetsData;
    if (type) filtered = filtered.filter(a => a.asset_type === type);
    if (insured === 'insured') filtered = filtered.filter(a => a.insured);
    if (insured === 'uninsured') filtered = filtered.filter(a => !a.insured);
    renderAssets(filtered);
}

function getAssetIcon(type) {
    const icons = { vehicle: '🚗', property: '🏠', electronics: '💻', furniture: '🪑', machinery: '⚙️' };
    return icons[type] || '📦';
}

async function viewAsset(id) {
    currentAssetId = id;
    try {
        const asset = await api.getAsset(id);
        renderAssetDetail(asset);
        navigateTo('asset-detail');
    } catch (err) {
        toast(err.message, 'error');
    }
}

function renderAssetDetail(asset) {
    const label = asset.make && asset.model ? `${asset.make} ${asset.model}` : (asset.description || asset.asset_type);

    document.getElementById('asset-info').innerHTML = `
        <div class="result-item"><span>Type</span><span>${getAssetIcon(asset.asset_type)} ${asset.asset_type}</span></div>
        <div class="result-item"><span>Description</span><span>${escapeHtml(label)}</span></div>
        <div class="result-item"><span>Purchase Price</span><span>R${formatNumber(asset.purchase_price)}</span></div>
        <div class="result-item"><span>Purchase Date</span><span>${asset.purchase_date ? asset.purchase_date.split('T')[0] : '—'}</span></div>
        <div class="result-item"><span>Condition</span><span>${asset.condition}</span></div>
        ${asset.serial_number ? `<div class="result-item"><span>Serial/VIN</span><span>${escapeHtml(asset.serial_number)}</span></div>` : ''}
        ${asset.make ? `<div class="result-item"><span>Make</span><span>${asset.make}</span></div>` : ''}
        ${asset.model ? `<div class="result-item"><span>Model</span><span>${asset.model}</span></div>` : ''}
        ${asset.year ? `<div class="result-item"><span>Year</span><span>${asset.year}</span></div>` : ''}
        ${asset.address ? `<div class="result-item"><span>Address</span><span>${escapeHtml(asset.address)}</span></div>` : ''}
        <div class="result-item"><span>Insured</span><span class="badge ${asset.insured ? 'badge-approved' : 'badge-submitted'}">${asset.insured ? 'Yes' : 'No'}</span></div>
        ${asset.insured ? `<div class="result-item"><span>Policy ID</span><span>${asset.policy_id}</span></div>` : ''}
        <div class="result-item"><span>Claims</span><span>${asset.claims_count}</span></div>
    `;

    // Valuation
    const v = asset.valuation;
    const changeClass = v.value_change >= 0 ? 'text-success' : 'text-danger';
    document.getElementById('asset-valuation').innerHTML = `
        <div class="valuation-highlight">
            <div class="valuation-big">R${formatNumber(v.current_value)}</div>
            <div class="${changeClass}">${v.value_change >= 0 ? '▲' : '▼'} R${formatNumber(Math.abs(v.value_change))} (${v.value_change_pct}%)</div>
        </div>
        <div class="result-item"><span>Depreciation Rate</span><span>${(v.depreciation_rate * 100).toFixed(1)}% / year</span></div>
        <div class="result-item"><span>Years Elapsed</span><span>${v.years_elapsed}</span></div>
        <div class="result-item"><span>Depreciated Value</span><span>R${formatNumber(v.depreciated_value)}</span></div>
        <div class="result-item"><span>Condition Adjustment</span><span>${v.condition_adjustment >= 0 ? '+' : ''}${(v.condition_adjustment * 100).toFixed(0)}%</span></div>
    `;

    // History
    const history = asset.valuation_history || [];
    if (history.length === 0) {
        document.getElementById('asset-history').innerHTML = '<p class="text-muted">No valuation history recorded yet.</p>';
    } else {
        document.getElementById('asset-history').innerHTML = `
            <table class="table">
                <thead>
                    <tr><th>Date</th><th>Value</th><th>Condition</th><th>Rate</th><th>Method</th><th>Notes</th></tr>
                </thead>
                <tbody>
                    ${history.map(h => `
                        <tr>
                            <td>${h.valuation_date ? h.valuation_date.split('T')[0] : '—'}</td>
                            <td>R${formatNumber(h.current_value)}</td>
                            <td>${h.condition}</td>
                            <td>${(h.depreciation_rate_used * 100).toFixed(1)}%</td>
                            <td><span class="badge badge-${h.method === 'manual' ? 'processing' : 'approved'}">${h.method}</span></td>
                            <td>${h.notes || '—'}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
    }
}

function toggleAssetFields() {
    const type = document.getElementById('asset-type').value;
    document.getElementById('vehicle-fields').style.display = type === 'vehicle' ? 'block' : 'none';
    document.getElementById('property-fields').style.display = type === 'property' ? 'block' : 'none';
}

async function handleRegisterAsset(e) {
    e.preventDefault();
    const data = {
        asset_type: document.getElementById('asset-type').value,
        description: document.getElementById('asset-description').value || null,
        purchase_price: parseFloat(document.getElementById('asset-price').value),
        purchase_date: new Date(document.getElementById('asset-purchase-date').value).toISOString(),
        condition: document.getElementById('asset-condition').value,
        serial_number: document.getElementById('asset-serial').value || null,
        make: document.getElementById('asset-make').value || null,
        model: document.getElementById('asset-model').value || null,
        year: parseInt(document.getElementById('asset-year').value) || null,
        address: document.getElementById('asset-address').value || null,
        square_footage: parseFloat(document.getElementById('asset-sqft').value) || null,
    };
    try {
        await api.registerAsset(data);
        hideModal('new-asset-modal');
        toast('Asset registered successfully', 'success');
        loadAssets();
        e.target.reset();
        toggleAssetFields();
    } catch (err) {
        toast(err.message, 'error');
    }
}

// ── Claims ──
async function loadClaims() {
    try {
        claimsData = await api.getClaims();
        renderClaims(claimsData);
    } catch (err) {
        console.error('Claims load error:', err);
    }
}

function renderClaims(claims) {
    const tbody = document.getElementById('claims-table');
    if (claims.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" class="text-center text-muted">No claims found</td></tr>';
        return;
    }
    tbody.innerHTML = claims.map(c => `
        <tr>
            <td>${c.claim_number}</td>
            <td>${c.asset_description || '—'}</td>
            <td>${c.claim_type}</td>
            <td>${c.amount_requested ? 'R' + formatNumber(c.amount_requested) : '—'}</td>
            <td>Tier ${c.tier || 1}</td>
            <td><span class="badge badge-${c.status}">${c.status}</span></td>
            <td>${c.fraud_flag ? '🚩' : '✓'}</td>
            <td>${c.suggested_payout ? 'R' + formatNumber(c.suggested_payout) : '—'}</td>
            <td>
                <button class="btn btn-sm btn-primary" onclick="viewClaim(${c.id})">View</button>
                ${c.status === 'submitted' ? `<button class="btn btn-sm btn-outline" onclick="processClaim(${c.id})">Process</button>` : ''}
            </td>
        </tr>
    `).join('');
}

function filterClaims() {
    const status = document.getElementById('filter-status').value;
    const tier = document.getElementById('filter-tier').value;
    let filtered = claimsData;
    if (status) filtered = filtered.filter(c => c.status === status);
    if (tier) filtered = filtered.filter(c => c.tier == tier);
    renderClaims(filtered);
}

async function openNewClaimModal() {
    // Load insured assets to populate the dropdown
    try {
        const assets = await api.getAssets();
        const insured = assets.filter(a => a.insured);
        const select = document.getElementById('claim-asset-id');
        select.innerHTML = '<option value="">-- Select an insured asset --</option>';
        insured.forEach(a => {
            const label = a.make && a.model ? `${a.make} ${a.model}` : (a.description || a.asset_type);
            select.innerHTML += `<option value="${a.id}" data-value="${a.current_value}">${label} — R${formatNumber(a.current_value)} (${a.asset_type})</option>`;
        });
        select.onchange = () => {
            const opt = select.options[select.selectedIndex];
            const hint = document.getElementById('claim-asset-value-hint');
            if (opt.value) {
                hint.textContent = `Current value: R${formatNumber(opt.dataset.value)}. Policy auto-assigned.`;
            } else {
                hint.textContent = '';
            }
        };
        if (insured.length === 0) {
            select.innerHTML = '<option value="">No insured assets — create a policy first</option>';
        }
        showModal('new-claim-modal');
    } catch (err) {
        toast(err.message, 'error');
    }
}

async function handleSubmitClaim(e) {
    e.preventDefault();
    const assetId = parseInt(document.getElementById('claim-asset-id').value);
    if (!assetId) {
        toast('Please select an insured asset', 'error');
        return;
    }
    const data = {
        asset_id: assetId,
        claim_type: document.getElementById('claim-type').value,
        description: document.getElementById('claim-description').value,
        amount_requested: parseFloat(document.getElementById('claim-amount').value) || null,
        incident_location: document.getElementById('claim-incident-location').value || null,
    };
    const incidentDate = document.getElementById('claim-incident-date').value;
    if (incidentDate) data.incident_date = new Date(incidentDate).toISOString();

    try {
        const result = await api.submitClaim(data);
        hideModal('new-claim-modal');
        toast(`Claim ${result.claim_number} submitted (Policy: ${result.policy_number})`, 'success');
        loadClaims();
        e.target.reset();
    } catch (err) {
        toast(err.message, 'error');
    }
}

async function processClaim(id) {
    try {
        await api.processClaim(id);
        toast('Claim processed through pipeline', 'success');
        loadClaims();
    } catch (err) {
        toast(err.message, 'error');
    }
}

async function viewClaim(id) {
    currentClaimId = id;
    try {
        const claim = await api.getClaim(id);
        renderClaimDetail(claim);
        navigateTo('claim-detail');
    } catch (err) {
        toast(err.message, 'error');
    }
}

function renderClaimDetail(claim) {
    // Info
    document.getElementById('claim-info').innerHTML = `
        <div class="result-item"><span>Claim Number</span><strong>${claim.claim_number}</strong></div>
        <div class="result-item"><span>Policy</span><span>${claim.policy_number || 'POL-' + claim.policy_id}</span></div>
        <div class="result-item"><span>Type</span><span>${claim.claim_type}</span></div>
        <div class="result-item"><span>Status</span><span class="badge badge-${claim.status}">${claim.status}</span></div>
        <div class="result-item"><span>Tier</span><span>Tier ${claim.tier}</span></div>
        <div class="result-item"><span>Amount Requested</span><span>${claim.amount_requested ? 'R' + formatNumber(claim.amount_requested) : '—'}</span></div>
        <div class="result-item"><span>Incident Date</span><span>${claim.incident_date || '—'}</span></div>
        <div class="result-item"><span>Location</span><span>${claim.incident_location || '—'}</span></div>
        <div class="result-item"><span>Description</span><span>${escapeHtml(claim.description)}</span></div>
    `;

    // Asset info at claim time
    let assetHtml = '<p class="text-muted">No asset linked.</p>';
    if (claim.asset) {
        const a = claim.asset;
        const label = a.make && a.model ? `${a.make} ${a.model}` : (a.description || a.asset_type);
        const changeClass = a.value_change_pct >= 0 ? 'text-success' : 'text-danger';
        assetHtml = `
            <div class="result-item"><span>Asset</span><strong>${getAssetIcon(a.asset_type)} ${escapeHtml(label)}</strong></div>
            <div class="result-item"><span>Purchase Price</span><span>R${formatNumber(a.purchase_price)}</span></div>
            <div class="result-item"><span>Current Value</span><strong>R${formatNumber(a.current_value)}</strong></div>
            <div class="result-item"><span>Value Change</span><span class="${changeClass}">${a.value_change_pct}%</span></div>
            <div class="result-item"><span>Depreciation Rate</span><span>${(a.depreciation_rate * 100).toFixed(1)}%/yr</span></div>
            <div class="result-item"><span>Condition</span><span>${a.condition}</span></div>
        `;
    }
    document.getElementById('claim-asset-info').innerHTML = assetHtml;

    // Risk & Depreciation from reports
    let analysisHtml = '<p class="text-muted">No analysis available. Process the claim first.</p>';
    if (claim.reports && claim.reports.length > 0) {
        const report = claim.reports[claim.reports.length - 1];
        try {
            const risk = JSON.parse(report.risk_breakdown || '{}');
            const dep = JSON.parse(report.depreciation_details || '{}');
            let riskHtml = '';
            if (risk.factors) {
                riskHtml = `
                    <h4>Risk Assessment</h4>
                    <div class="result-item"><span>Risk Level</span><span class="badge badge-${risk.risk_level}">${risk.risk_level}</span></div>
                    <div class="result-item"><span>Suggested Premium</span><strong>R${formatNumber(risk.suggested_premium)}</strong></div>
                    <ul class="factor-list mt-1">
                        ${risk.factors.map(f => `
                            <li class="factor-item">
                                <span class="${f.applied ? 'factor-applied' : 'factor-not-applied'}">${f.name}</span>
                                <span>${f.applied ? (f.weight >= 0 ? '+' : '') + (f.weight * 100).toFixed(0) + '%' : 'N/A'}</span>
                            </li>
                        `).join('')}
                    </ul>
                `;
            }
            let depHtml = '';
            if (dep.purchase_price) {
                depHtml = `
                    <h4 class="mt-1">Depreciation</h4>
                    <div class="result-item"><span>Depreciated Value</span><span>R${formatNumber(dep.depreciated_value)}</span></div>
                    <div class="result-item"><span>Adjusted Value</span><span>R${formatNumber(dep.adjusted_value)}</span></div>
                    <div class="result-item"><span>Excess</span><span>R${formatNumber(dep.excess)}</span></div>
                    <div class="result-item"><span>Suggested Payout</span><strong>R${formatNumber(dep.suggested_payout)}</strong></div>
                `;
            }
            analysisHtml = riskHtml + depHtml;
        } catch { analysisHtml = `<p>${report.summary}</p>`; }
    }
    document.getElementById('claim-analysis').innerHTML = analysisHtml;

    // Fraud
    let fraudHtml = '<p class="text-muted">No fraud assessment yet.</p>';
    if (claim.fraud_flag !== null) {
        fraudHtml = `
            <div class="result-item"><span>Flagged</span><span>${claim.fraud_flag ? '🚩 Yes' : '✓ No'}</span></div>
            <div class="result-item"><span>Recommendation</span><span>${claim.fraud_reason || '—'}</span></div>
        `;
    }
    document.getElementById('claim-fraud').innerHTML = fraudHtml;

    // Decision
    const sp = claim.suggested_payout || 0;
    document.getElementById('detail-suggested-payout').textContent = 'R' + formatNumber(sp);
    document.getElementById('approved-payout').value = sp;

    const decisionCard = document.getElementById('claim-decision-card');
    if (['approved', 'rejected'].includes(claim.status)) {
        decisionCard.innerHTML = `
            <h3>Decision</h3>
            <div class="result-item"><span>Status</span><span class="badge badge-${claim.status}">${claim.status}</span></div>
            <div class="result-item"><span>Approved Payout</span><strong>R${formatNumber(claim.approved_payout || 0)}</strong></div>
            <div class="result-item"><span>Approved By</span><span>User #${claim.approved_by || '—'}</span></div>
        `;
    }

    // Audit Trail
    const auditHtml = claim.audit_trail && claim.audit_trail.length > 0
        ? claim.audit_trail.map(a => `
            <div class="card" style="margin-bottom:0.5rem;padding:0.75rem">
                <div class="result-item"><span>Action</span><span class="badge badge-${a.action}">${a.action}</span></div>
                <div class="result-item"><span>Final Value</span><span>R${formatNumber(a.final_value || 0)}</span></div>
                <div class="result-item"><span>By</span><span>User #${a.performed_by}</span></div>
                <div class="result-item"><span>When</span><span>${a.timestamp || '—'}</span></div>
            </div>
        `).join('')
        : '<p class="text-muted">No audit entries yet.</p>';
    document.getElementById('claim-audit').innerHTML = auditHtml;
}

async function approveClaim() {
    const payout = parseFloat(document.getElementById('approved-payout').value);
    if (isNaN(payout) || payout < 0) {
        toast('Enter a valid payout amount', 'error');
        return;
    }
    try {
        await api.approveClaim(currentClaimId, payout);
        toast('Claim approved', 'success');
        viewClaim(currentClaimId);
    } catch (err) {
        toast(err.message, 'error');
    }
}

function showRejectDialog() {
    showModal('reject-modal');
}

async function handleRejectClaim(e) {
    e.preventDefault();
    const reason = document.getElementById('reject-reason').value;
    try {
        await api.rejectClaim(currentClaimId, reason);
        hideModal('reject-modal');
        toast('Claim rejected', 'success');
        viewClaim(currentClaimId);
    } catch (err) {
        toast(err.message, 'error');
    }
}

// ── Policies ──
async function loadPolicies() {
    try {
        const policies = await api.getPolicies();
        const tbody = document.getElementById('policies-table');
        if (policies.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">No policies yet</td></tr>';
            return;
        }
        tbody.innerHTML = policies.map(p => `
            <tr>
                <td>${p.policy_number}</td>
                <td>${p.valuation_type}</td>
                <td>R${formatNumber(p.premium_amount)}</td>
                <td>${p.asset_count} asset${p.asset_count !== 1 ? 's' : ''}</td>
                <td><span class="badge badge-${p.status || 'active'}">${p.status || 'active'}</span></td>
                <td><button class="btn btn-sm btn-outline" onclick="viewPolicy(${p.id})">View</button></td>
            </tr>
        `).join('');
    } catch (err) {
        console.error('Policies load error:', err);
    }
}

async function openNewPolicyModal() {
    // Load uninsured assets for checkboxes
    try {
        const assets = await api.getAssets();
        const uninsured = assets.filter(a => !a.insured);
        const container = document.getElementById('policy-asset-checkboxes');
        if (uninsured.length === 0) {
            container.innerHTML = '<p class="text-muted">No uninsured assets. Register assets first.</p>';
        } else {
            container.innerHTML = uninsured.map(a => {
                const label = a.make && a.model ? `${a.make} ${a.model}` : (a.description || a.asset_type);
                return `
                    <label class="checkbox-item">
                        <input type="checkbox" name="policy-assets" value="${a.id}">
                        <span>${getAssetIcon(a.asset_type)} ${escapeHtml(label)} — R${formatNumber(a.current_value)} (${a.condition})</span>
                    </label>
                `;
            }).join('');
        }
        showModal('new-policy-modal');
    } catch (err) {
        toast(err.message, 'error');
    }
}

async function handleCreatePolicy(e) {
    e.preventDefault();
    const checked = document.querySelectorAll('input[name="policy-assets"]:checked');
    const assetIds = Array.from(checked).map(c => parseInt(c.value));
    if (assetIds.length === 0) {
        toast('Select at least one asset to insure', 'error');
        return;
    }
    const data = {
        asset_ids: assetIds,
        valuation_type: document.getElementById('policy-valuation').value,
        premium_amount: parseFloat(document.getElementById('policy-premium').value),
        coverage_details: document.getElementById('policy-coverage').value,
        duration_months: parseInt(document.getElementById('policy-duration').value),
        start_date: new Date(document.getElementById('policy-start-date').value).toISOString(),
    };
    try {
        const result = await api.createPolicy(data);
        hideModal('new-policy-modal');
        toast(`Policy ${result.policy_number} created with ${result.assets_insured} assets`, 'success');
        loadPolicies();
        e.target.reset();
    } catch (err) {
        toast(err.message, 'error');
    }
}

// ── Calculators ──
async function loadToolAssets() {
    try {
        const assets = await api.getAssets();
        const select = document.getElementById('tool-asset-select');
        select.innerHTML = '<option value="">-- Select an asset --</option>';
        assets.forEach(a => {
            const label = a.make && a.model ? `${a.make} ${a.model}` : (a.description || a.asset_type);
            select.innerHTML += `<option value="${a.id}">${getAssetIcon(a.asset_type)} ${label} — R${formatNumber(a.current_value)}</option>`;
        });
    } catch (err) {
        console.error('Failed to load tool assets:', err);
    }
}

async function calculateAssetValuation() {
    const assetId = document.getElementById('tool-asset-select').value;
    if (!assetId) {
        toast('Select an asset first', 'error');
        return;
    }
    try {
        const result = await api.getAssetFullValuation(assetId);
        const el = document.getElementById('asset-calc-result');
        el.style.display = 'block';

        const v = result.valuation;
        const r = result.risk;
        const changeClass = v.value_change >= 0 ? 'text-success' : 'text-danger';

        el.innerHTML = `
            <h4>Current Valuation</h4>
            <div class="result-item"><span>Purchase Price</span><span>R${formatNumber(v.purchase_price)}</span></div>
            <div class="result-item"><span>Current Value</span><strong>R${formatNumber(v.current_value)}</strong></div>
            <div class="result-item"><span>Change</span><span class="${changeClass}">${v.value_change_pct}%</span></div>
            <div class="result-item"><span>Years Elapsed</span><span>${v.years_elapsed}</span></div>
            <div class="result-item"><span>Depreciation Rate</span><span>${(v.depreciation_rate * 100).toFixed(1)}%/yr</span></div>
            <h4 class="mt-1">Risk Profile</h4>
            <div class="result-item"><span>Risk Level</span><span class="badge badge-${r.risk_level}">${r.risk_level}</span></div>
            <div class="result-item"><span>Suggested Premium</span><strong>R${formatNumber(r.suggested_premium)}</strong></div>
            <ul class="factor-list mt-1">
                ${r.factors.map(f => `
                    <li class="factor-item">
                        <span class="${f.applied ? 'factor-applied' : 'factor-not-applied'}">${f.name}: ${f.reason}</span>
                        <span>${f.applied ? (f.weight >= 0 ? '+' : '') + (f.weight * 100).toFixed(0) + '%' : '—'}</span>
                    </li>
                `).join('')}
            </ul>
        `;
    } catch (err) {
        toast(err.message, 'error');
    }
}

async function handleCalculateRisk(e) {
    e.preventDefault();
    const data = {
        asset_type: document.getElementById('risk-asset-type').value,
        asset_value: parseFloat(document.getElementById('risk-asset-value').value),
        driver_age: parseInt(document.getElementById('risk-driver-age').value) || null,
        location: document.getElementById('risk-location').value || null,
        previous_claims_count: parseInt(document.getElementById('risk-prev-claims').value) || 0,
        driving_experience_years: parseInt(document.getElementById('risk-experience').value) || null,
    };
    try {
        const result = await api.calculateRisk(data);
        const el = document.getElementById('risk-result');
        el.style.display = 'block';
        el.innerHTML = `
            <h4>Premium Calculation Result</h4>
            <div class="result-item"><span>Risk Level</span><span class="badge badge-${result.risk_level}">${result.risk_level}</span></div>
            <div class="result-item"><span>Base Rate</span><span>R${formatNumber(result.base_rate)}</span></div>
            <div class="result-item"><span>Total Risk Score</span><span>${result.total_risk_score}</span></div>
            <div class="result-item"><span><strong>Suggested Premium</strong></span><strong>R${formatNumber(result.suggested_premium)}</strong></div>
            <h4 class="mt-1">Risk Factors</h4>
            <ul class="factor-list">
                ${result.factors.map(f => `
                    <li class="factor-item">
                        <span class="${f.applied ? 'factor-applied' : 'factor-not-applied'}">${f.name}: ${f.reason}</span>
                        <span>${f.applied ? (f.weight >= 0 ? '+' : '') + (f.weight * 100).toFixed(0) + '%' : '—'}</span>
                    </li>
                `).join('')}
            </ul>
        `;
    } catch (err) {
        toast(err.message, 'error');
    }
}

async function handleCalculateDepreciation(e) {
    e.preventDefault();
    const data = {
        purchase_price: parseFloat(document.getElementById('dep-price').value),
        purchase_date: new Date(document.getElementById('dep-date').value).toISOString(),
        asset_type: document.getElementById('dep-asset-type').value,
        condition: document.getElementById('dep-condition').value,
        excess: parseFloat(document.getElementById('dep-excess').value) || 500,
        valuation_type: document.getElementById('dep-valuation').value,
    };
    const market = document.getElementById('dep-market');
    if (market && market.value) data.market_value = parseFloat(market.value);

    try {
        const result = await api.calculateDepreciation(data);
        const el = document.getElementById('depreciation-result');
        el.style.display = 'block';
        el.innerHTML = `
            <h4>Depreciation Result</h4>
            <div class="result-item"><span>Purchase Price</span><span>R${formatNumber(result.purchase_price)}</span></div>
            <div class="result-item"><span>Depreciation Rate</span><span>${(result.depreciation_rate * 100).toFixed(0)}% / year</span></div>
            <div class="result-item"><span>Years Elapsed</span><span>${result.years_elapsed}</span></div>
            <div class="result-item"><span>Depreciated Value</span><span>R${formatNumber(result.depreciated_value)}</span></div>
            <div class="result-item"><span>Condition</span><span>${result.condition} (${result.condition_adjustment >= 0 ? '+' : ''}${(result.condition_adjustment * 100).toFixed(0)}%)</span></div>
            <div class="result-item"><span>Adjusted Value</span><span>R${formatNumber(result.adjusted_value)}</span></div>
            <div class="result-item"><span>Excess</span><span>R${formatNumber(result.excess)}</span></div>
            <div class="result-item"><span><strong>Suggested Payout</strong></span><strong>R${formatNumber(result.suggested_payout)}</strong></div>
        `;
    } catch (err) {
        toast(err.message, 'error');
    }
}

// ── Modals ──
function showModal(id) {
    document.getElementById(id).classList.add('active');
}

function hideModal(id) {
    document.getElementById(id).classList.remove('active');
}

// ── Toast ──
function toast(message, type = 'success') {
    const el = document.getElementById('toast');
    el.textContent = message;
    el.className = `toast show ${type}`;
    setTimeout(() => el.classList.remove('show'), 3000);
}

// ── Utilities ──
function formatNumber(n) {
    return Number(n).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function truncate(str, len) {
    if (!str) return '—';
    return str.length > len ? str.substring(0, len) + '...' : str;
}

function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}
