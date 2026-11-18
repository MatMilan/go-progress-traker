// ============================================
// НАСТРОЙКИ: Вставьте ваши данные из Supabase
// ============================================
const SUPABASE_URL = 'https://ppmdlfrqxqpaktrsgyoc.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_59ljxricx6beZsJ_szZFgg_YmiWdJgx';

const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ============================================
// Данные
// ============================================
let allProfiles = [];
let allGoLevels = [];
let statsMap = {};
let dailyMap = {};
let levelMap = {};
let trialsMap = {};
let trialsPassedCount = {};
let allDates = [];

// ============================================
// Состояние интерфейса
// ============================================
let selectedDate = null;
let selectedLevel = null;
let sortState = { key: 'name', direction: 'asc' };
let currentChart = null;        // график на странице деталей пользователя
let twoWeeksChart = null;       // график активности за 2 недели на странице сравнения

const COLUMNS = [
    { key: 'name',   label: 'Имя',                   type: 'string' },
    { key: 'elo',    label: 'Рейтинг',               type: 'number' },
    { key: 'total',  label: 'Всего решено',          type: 'number' },
    { key: 'unique', label: 'Уникальных',            type: 'number' },
    { key: 'daily',  label: 'Решено за день',        type: 'number' },
    { key: 'level',  label: 'Решено по уровню',      type: 'number' },
    { key: 'trials', label: 'Испытаний пройдено',    type: 'number' },
];

// ============================================
// Старт
// ============================================
document.addEventListener('DOMContentLoaded', async () => {
    await loadGoLevels();
    await loadAllData();

    renderFilterRow();          // создаём селекты внутри таблицы
    populateSelectors();        // заполняем их опциями
    renderComparisonHeader();   // строка заголовков
    renderComparisonTable();    // данные
    renderTwoWeeksChart();      // двухнедельная активность

    document.getElementById('back-btn').addEventListener('click', showComparisonView);
});

// ============================================
// Загрузка справочника уровней
// ============================================
async function loadGoLevels() {
    const { data, error } = await db
        .from('go_levels')
        .select('*')
        .order('sort_order');

    if (error) {
        console.error('Ошибка загрузки уровней:', error);
        return;
    }
    allGoLevels = data || [];
}

// ============================================
// Загрузка всех данных для таблицы сравнения
// ============================================
async function loadAllData() {
    const loadingEl = document.getElementById('loading');

    try {
        const { data: profiles, error: profilesError } = await db
            .from('profiles')
            .select('*')
            .eq('is_active', true)
            .order('username');

        if (profilesError) throw profilesError;

        if (!profiles || profiles.length === 0) {
            loadingEl.textContent = 'Нет пользователей для отображения';
            return;
        }

        allProfiles = profiles;
        const ids = profiles.map(p => p.id);

        const { data: stats } = await db
            .from('current_stats')
            .select('*')
            .in('profile_id', ids);

        statsMap = {};
        (stats || []).forEach(s => { statsMap[s.profile_id] = s; });

        const { data: daily } = await db
            .from('daily_activity')
            .select('profile_id, activity_date, solved_count')
            .in('profile_id', ids);

        dailyMap = {};
        const dateSet = new Set();
        (daily || []).forEach(d => {
            if (!dailyMap[d.profile_id]) dailyMap[d.profile_id] = {};
            dailyMap[d.profile_id][d.activity_date] = d.solved_count;
            dateSet.add(d.activity_date);
        });
        allDates = Array.from(dateSet).sort().reverse();

        const { data: levels } = await db
            .from('profile_level_stats')
            .select('profile_id, level_code, solved_count')
            .in('profile_id', ids);

        levelMap = {};
        (levels || []).forEach(l => {
            if (!levelMap[l.profile_id]) levelMap[l.profile_id] = {};
            levelMap[l.profile_id][l.level_code] = l.solved_count;
        });

        const { data: trials } = await db
            .from('profile_time_trials')
            .select('profile_id, level_code, passed')
            .in('profile_id', ids);

        trialsMap = {};
        trialsPassedCount = {};
        (trials || []).forEach(t => {
            if (!trialsMap[t.profile_id]) trialsMap[t.profile_id] = {};
            trialsMap[t.profile_id][t.level_code] = t.passed;

            if (!trialsPassedCount[t.profile_id]) trialsPassedCount[t.profile_id] = 0;
            if (t.passed) trialsPassedCount[t.profile_id]++;
        });

        loadingEl.style.display = 'none';

    } catch (error) {
        console.error('Ошибка загрузки данных:', error);
        loadingEl.textContent = 'Ошибка загрузки данных. Проверьте подключение к Supabase.';
    }
}

// ============================================
// Строка фильтров внутри таблицы
// ============================================
function renderFilterRow() {
    const thead = document.getElementById('comparison-head');

    const old = thead.querySelector('tr.filter-row');
    if (old) old.remove();

    const filterRow = document.createElement('tr');
    filterRow.className = 'filter-row';

    COLUMNS.forEach(col => {
        const th = document.createElement('th');
        th.className = 'filter-cell';

        if (col.key === 'daily') {
            const sel = document.createElement('select');
            sel.id = 'date-select';
            th.appendChild(sel);
        } else if (col.key === 'level') {
            const sel = document.createElement('select');
            sel.id = 'level-select';
            th.appendChild(sel);
        }

        filterRow.appendChild(th);
    });

    thead.appendChild(filterRow);
}

// ============================================
// Заполнение выпадающих списков
// ============================================
function populateSelectors() {
    const dateSel = document.getElementById('date-select');
    dateSel.innerHTML = '';
    allDates.forEach(d => {
        const opt = document.createElement('option');
        opt.value = d;
        opt.textContent = formatDate(d);
        dateSel.appendChild(opt);
    });
    if (allDates.length > 0) {
        selectedDate = allDates[0];
        dateSel.value = selectedDate;
    }
    dateSel.addEventListener('change', e => {
        selectedDate = e.target.value;
        renderComparisonTable();
    });

    const levelSel = document.getElementById('level-select');
    levelSel.innerHTML = '';
    allGoLevels.forEach(l => {
        const opt = document.createElement('option');
        opt.value = l.code;
        opt.textContent = l.label;
        levelSel.appendChild(opt);
    });
    if (allGoLevels.length > 0) {
        selectedLevel = allGoLevels[0].code;
        levelSel.value = selectedLevel;
    }
    levelSel.addEventListener('change', e => {
        selectedLevel = e.target.value;
        renderComparisonTable();
    });
}

// ============================================
// Заголовок таблицы с сортировкой
// ============================================
function renderComparisonHeader() {
    const thead = document.getElementById('comparison-head');

    let headerRow = thead.querySelector('tr.header-row');
    if (!headerRow) {
        headerRow = document.createElement('tr');
        headerRow.className = 'header-row';
        thead.insertBefore(headerRow, thead.firstChild);
    }
    headerRow.innerHTML = '';

    COLUMNS.forEach(col => {
        const th = document.createElement('th');
        th.classList.add('sortable');
        th.dataset.key = col.key;

        const labelSpan = document.createElement('span');
        labelSpan.textContent = col.label;
        th.appendChild(labelSpan);

        const ind = document.createElement('span');
        ind.className = 'sort-ind';
        if (sortState.key === col.key) {
            ind.textContent = sortState.direction === 'asc' ? ' ▲' : ' ▼';
        }
        th.appendChild(ind);

        th.addEventListener('click', () => handleSort(col));
        headerRow.appendChild(th);
    });
}

function handleSort(col) {
    if (sortState.key === col.key) {
        sortState.direction = sortState.direction === 'asc' ? 'desc' : 'asc';
    } else {
        sortState.key = col.key;
        sortState.direction = col.type === 'string' ? 'asc' : 'desc';
    }
    renderComparisonHeader();
    renderComparisonTable();
}

// ============================================
// Построение и отрисовка таблицы сравнения
// ============================================
function buildComparisonRows() {
    const levelObj = allGoLevels.find(l => l.code === selectedLevel);
    const levelTotal = levelObj ? (levelObj.total_problems || 0) : 0;

    return allProfiles.map(p => {
        const s = statsMap[p.id] || {};
        const levelSolved = selectedLevel ? (levelMap[p.id]?.[selectedLevel] ?? 0) : 0;

        return {
            id: p.id,
            name: p.full_name || p.username,
            elo: s.current_elo != null ? Math.round(s.current_elo) : null,
            total: s.total_solves || 0,
            unique: s.unique_solves || 0,
            daily: selectedDate ? (dailyMap[p.id]?.[selectedDate] ?? 0) : 0,
            level: levelSolved,
            levelPct: levelTotal > 0 ? Math.round((levelSolved / levelTotal) * 100) : null,
            trials: trialsPassedCount[p.id] || 0,
        };
    });
}

function renderComparisonTable() {
    const tbody = document.getElementById('comparison-body');
    let rows = buildComparisonRows();

    const { key, direction } = sortState;
    const mult = direction === 'asc' ? 1 : -1;

    rows.sort((a, b) => {
        let av = a[key];
        let bv = b[key];
        if (av == null) av = -Infinity;
        if (bv == null) bv = -Infinity;

        if (typeof av === 'string' || typeof bv === 'string') {
            return mult * String(av).localeCompare(String(bv), 'ru');
        }
        return mult * ((av > bv) - (av < bv));
    });

    tbody.innerHTML = '';
    rows.forEach(r => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${escapeHtml(r.name)}</td>
            <td>${r.elo != null ? r.elo : '-'}</td>
            <td>${r.total}</td>
            <td>${r.unique}</td>
            <td>${r.daily}</td>
            <td>${r.level}${r.levelPct != null ? ` (${r.levelPct}%)` : ''}</td>
            <td>${r.trials}</td>
        `;
        tr.addEventListener('click', () => showUserDetails(r.id));
        tbody.appendChild(tr);
    });
}

// ============================================
// Детальная страница пользователя
// ============================================
async function showUserDetails(profileId) {
    const profile = allProfiles.find(p => p.id === profileId);
    if (!profile) return;

    document.getElementById('comparison-section').style.display = 'none';
    document.getElementById('user-detail-section').style.display = 'block';

    document.getElementById('user-detail-name').textContent =
        profile.full_name || profile.username;

    const s = statsMap[profileId] || {};
    document.getElementById('detail-elo').textContent =
        s.current_elo != null ? Math.round(s.current_elo) : '-';
    document.getElementById('detail-total').textContent = s.total_solves || 0;
    document.getElementById('detail-unique').textContent = s.unique_solves || 0;

    await loadActivityChart(profileId);
    renderLevelChart(profileId);
}

// ============================================
// График активности по дням (линейный)
// ============================================
async function loadActivityChart(profileId) {
    const { data, error } = await db
        .from('daily_activity')
        .select('activity_date, solved_count')
        .eq('profile_id', profileId)
        .order('activity_date');

    if (error) {
        console.error('Ошибка загрузки активности:', error);
        return;
    }

    const ctx = document.getElementById('activity-chart').getContext('2d');

    if (currentChart) {
        currentChart.destroy();
    }

    const labels = (data || []).map(d => formatDate(d.activity_date));
    const counts = (data || []).map(d => d.solved_count);

    currentChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Решено задач',
                data: counts,
                borderColor: '#3498db',
                backgroundColor: 'rgba(52, 152, 219, 0.1)',
                fill: true,
                tension: 0.3
            }]
        },
        options: {
            responsive: true,
            plugins: { legend: { display: false } },
            scales: { y: { beginAtZero: true } }
        }
    });
}

// ============================================
// Столбцовая диаграмма уровней + испытания
// ============================================
function renderLevelChart(profileId) {
    const container = document.getElementById('level-chart');
    container.innerHTML = '';

    allGoLevels.forEach(level => {
        const solved = levelMap[profileId]?.[level.code] ?? 0;
        const total = level.total_problems ?? 0;
        const pct = total > 0 ? Math.round((solved / total) * 100) : 0;
        const passed = trialsMap[profileId]?.[level.code] ?? false;

        const col = document.createElement('div');
        col.className = 'level-col';
        col.innerHTML = `
            <div class="level-value" title="${level.label}: ${solved} из ${total} (${pct}%)">${solved}/${total}</div>
            <div class="level-bar-area">
                <div class="level-bar" style="height:${pct}%"></div>
            </div>
            <div class="level-xlabel" title="${level.label}">${level.code}</div>
            <input type="checkbox" class="trial-check" ${passed ? 'checked' : ''} disabled
                   title="${passed ? 'Испытание на время пройдено' : 'Испытание на время не пройдено'}">
        `;
        container.appendChild(col);
    });
}

// ============================================
// Возврат к таблице сравнения
// ============================================
function showComparisonView() {
    document.getElementById('comparison-section').style.display = 'block';
    document.getElementById('user-detail-section').style.display = 'none';

    if (currentChart) {
        currentChart.destroy();
        currentChart = null;
    }
}
// ============================================
// График активности за последние 2 недели
// ============================================
function renderTwoWeeksChart() {
    const canvas = document.getElementById('two-weeks-chart');
    if (!canvas) return;

    // Берём последние 14 дат из allDates (он отсортирован по убыванию)
    // и разворачиваем в хронологический порядок (слева направо)
    const lastDates = allDates.slice(0, 14).reverse();

    if (lastDates.length === 0) return;

    const ctx = canvas.getContext('2d');

    // Уничтожаем старый график, если он был
    if (twoWeeksChart) {
        twoWeeksChart.destroy();
    }

    // Палитра цветов для кривых
    const colors = [
        '#3498db', '#e74c3c', '#2ecc71', '#f39c12', '#9b59b6',
        '#1abc9c', '#e67e22', '#34495e', '#16a085', '#c0392b',
        '#8e44ad', '#2980b9', '#27ae60', '#d35400', '#7f8c8d',
        '#2c3e50', '#f1c40f', '#95a5a6', '#d68910', '#1f618d'
    ];

    // Строим по одному датасету на каждого пользователя
    const datasets = allProfiles.map((profile, index) => {
        const color = colors[index % colors.length];
        const data = lastDates.map(date => dailyMap[profile.id]?.[date] ?? 0);

        return {
            label: profile.full_name || profile.username,
            data: data,
            borderColor: color,
            backgroundColor: color,
            tension: 0.3,
            fill: false,
            pointRadius: 3,
            pointHoverRadius: 6,
            borderWidth: 2,
        };
    });

    twoWeeksChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: lastDates.map(d => formatDate(d)),
            datasets: datasets,
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                // Интерактивная легенда: клик скрывает/показывает кривую
                legend: {
                    display: true,
                    position: 'top',
                    labels: {
                        usePointStyle: true,
                        padding: 18,
                        font: { size: 13 },
                    },
                },
                tooltip: {
                    mode: 'index',
                    intersect: false,
                },
            },
            interaction: {
                mode: 'nearest',
                axis: 'x',
                intersect: false,
            },
            scales: {
                y: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: 'Решено задач',
                    },
                },
                x: {
                    title: {
                        display: true,
                        text: 'Дата',
                    },
                },
            },
        },
    });
}
// ============================================
// Вспомогательные функции
// ============================================
function formatDate(iso) {
    const [y, m, d] = iso.split('-');
    return `${d}.${m}.${y}`;
}

function escapeHtml(str) {
    if (str == null) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
