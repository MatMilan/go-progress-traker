// ============================================
// НАСТРОЙКИ: Вставьте ваши данные из Supabase
// ============================================
const SUPABASE_URL = 'https://ppmdlfrqxqpaktrsgyoc.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_59ljxricx6beZsJ_szZFgg_YmiWdJgx';

// ============================================
// Инициализация
// ============================================
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Глобальные переменные
let allProfiles = [];
let allGoLevels = [];
let currentChart = null;

// ============================================
// Загрузка данных при старте
// ============================================
document.addEventListener('DOMContentLoaded', async () => {
    await loadGoLevels();
    await loadComparisonTable();
    
    // Обработчик кнопки "Назад"
    document.getElementById('back-btn').addEventListener('click', showComparisonView);
});

// ============================================
// Загрузка справочника уровней
// ============================================
async function loadGoLevels() {
    const { data, error } = await supabase
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
// Загрузка таблицы сравнения
// ============================================
async function loadComparisonTable() {
    const loadingEl = document.getElementById('loading');
    const tbody = document.getElementById('comparison-body');
    
    try {
        // Загружаем профили
        const { data: profiles, error: profilesError } = await supabase
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
        
        // Загружаем текущую статистику для всех профилей
        const profileIds = profiles.map(p => p.id);
        const { data: stats, error: statsError } = await supabase
            .from('current_stats')
            .select('*')
            .in('profile_id', profileIds);
        
        if (statsError) throw statsError;
        
        // Загружаем испытания на время для всех профилей
        const { data: trials, error: trialsError } = await supabase
            .from('profile_time_trials')
            .select('profile_id, passed')
            .in('profile_id', profileIds);
        
        if (trialsError) throw trialsError;
        
        // Строим карту статистики по profile_id
        const statsMap = {};
        (stats || []).forEach(s => {
            statsMap[s.profile_id] = s;
        });
        
        // Строим карту испытаний: сколько пройдено у каждого профиля
        const trialsMap = {};
        (trials || []).forEach(t => {
            if (!trialsMap[t.profile_id]) {
                trialsMap[t.profile_id] = 0;
            }
            if (t.passed) {
                trialsMap[t.profile_id]++;
            }
        });
        
        // Заполняем таблицу
        tbody.innerHTML = '';
        profiles.forEach(profile => {
            const stat = statsMap[profile.id] || {};
            const trialsPassed = trialsMap[profile.id] || 0;
            
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${profile.full_name || profile.username}</td>
                <td>${profile.username}</td>
                <td>${stat.current_elo ? Math.round(stat.current_elo) : '-'}</td>
                <td>${stat.total_solves || 0}</td>
                <td>${stat.unique_solves || 0}</td>
                <td>${trialsPassed}</td>
            `;
            
            // Клик по строке открывает детали
            row.addEventListener('click', () => showUserDetails(profile.id));
            tbody.appendChild(row);
        });
        
        loadingEl.style.display = 'none';
        
    } catch (error) {
        console.error('Ошибка загрузки данных:', error);
        loadingEl.textContent = 'Ошибка загрузки данных. Проверьте подключение к Supabase.';
    }
}

// ============================================
// Показ детальной информации о пользователе
// ============================================
async function showUserDetails(profileId) {
    const profile = allProfiles.find(p => p.id === profileId);
    if (!profile) return;
    
    // Переключаем видимость секций
    document.getElementById('comparison-section').style.display = 'none';
    document.getElementById('user-detail-section').style.display = 'block';
    
    // Устанавливаем имя
    document.getElementById('user-detail-name').textContent = 
        profile.full_name || profile.username;
    
    try {
        // Загружаем текущую статистику
        const { data: currentStats } = await supabase
            .from('current_stats')
            .select('*')
            .eq('profile_id', profileId)
            .single();
        
        if (currentStats) {
            document.getElementById('detail-elo').textContent = 
                currentStats.current_elo ? Math.round(currentStats.current_elo) : '-';
            document.getElementById('detail-total').textContent = 
                currentStats.total_solves || 0;
            document.getElementById('detail-unique').textContent = 
                currentStats.unique_solves || 0;
        }
        
        // Загружаем активность по дням
        await loadActivityChart(profileId);
        
        // Загружаем уровни
        await loadLevelsTable(profileId);
        
        // Загружаем испытания
        await loadTrialsTable(profileId);
        
    } catch (error) {
        console.error('Ошибка загрузки деталей:', error);
    }
}

// ============================================
// График активности по дням
// ============================================
async function loadActivityChart(profileId) {
    const { data, error } = await supabase
        .from('daily_activity')
        .select('activity_date, solved_count')
        .eq('profile_id', profileId)
        .order('activity_date');
    
    if (error) {
        console.error('Ошибка загрузки активности:', error);
        return;
    }
    
    const ctx = document.getElementById('activity-chart').getContext('2d');
    
    // Уничтожаем предыдущий график, если он был
    if (currentChart) {
        currentChart.destroy();
    }
    
    const labels = (data || []).map(d => d.activity_date);
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
            plugins: {
                legend: {
                    display: false
                }
            },
            scales: {
                y: {
                    beginAtZero: true
                }
            }
        }
    });
}

// ============================================
// Таблица уровней
// ============================================
async function loadLevelsTable(profileId) {
    const { data, error } = await supabase
        .from('profile_level_stats')
        .select('level_code, solved_count')
        .eq('profile_id', profileId);
    
    if (error) {
        console.error('Ошибка загрузки уровней:', error);
        return;
    }
    
    const tbody = document.getElementById('levels-body');
    tbody.innerHTML = '';
    
    // Строим карту данных пользователя по уровням
    const userLevelsMap = {};
    (data || []).forEach(item => {
        userLevelsMap[item.level_code] = item.solved_count;
    });
    
    // Проходим по всем уровням из справочника
    allGoLevels.forEach(level => {
        const solved = userLevelsMap[level.code] || 0;
        const total = level.total_problems || 0;
        const progress = total > 0 ? Math.round((solved / total) * 100) : 0;
        
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${level.label}</td>
            <td>${solved}</td>
            <td>${total}</td>
            <td>
                <div class="progress-bar">
                    <div class="progress-fill" style="width: ${progress}%"></div>
                </div>
                ${progress}%
            </td>
        `;
        tbody.appendChild(row);
    });
}

// ============================================
// Таблица испытаний на время
// ============================================
async function loadTrialsTable(profileId) {
    const { data, error } = await supabase
        .from('profile_time_trials')
        .select('level_code, passed, best_score')
        .eq('profile_id', profileId);
    
    if (error) {
        console.error('Ошибка загрузки испытаний:', error);
        return;
    }
    
    const tbody = document.getElementById('trials-body');
    tbody.innerHTML = '';
    
    // Строим карту испытаний пользователя
    const userTrialsMap = {};
    (data || []).forEach(item => {
        userTrialsMap[item.level_code] = item;
    });
    
    // Проходим по всем уровням из справочника
    allGoLevels.forEach(level => {
        const trial = userTrialsMap[level.code];
        const passed = trial ? trial.passed : false;
        const bestScore = trial ? trial.best_score : null;
        
        const statusClass = passed ? 'passed' : 'not-passed';
        const statusText = passed ? '✅ Пройден' : '❌ Не пройден';
        
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${level.label}</td>
            <td class="${statusClass}">${statusText}</td>
            <td>${bestScore !== null ? bestScore : '-'}</td>
        `;
        tbody.appendChild(row);
    });
}

// ============================================
// Возврат к таблице сравнения
// ============================================
function showComparisonView() {
    document.getElementById('comparison-section').style.display = 'block';
    document.getElementById('user-detail-section').style.display = 'none';
    
    // Уничтожаем график, чтобы не было утечек памяти
    if (currentChart) {
        currentChart.destroy();
        currentChart = null;
    }
}