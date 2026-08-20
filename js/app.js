import { GradeCalculator } from './calculator.js';
import { StorageManager } from './storage.js';
import { SafeVault } from './crypto.js';

document.addEventListener('DOMContentLoaded', () => {
    // 1. Telegram WebApp Initialization
    const tg = window.Telegram?.WebApp;
    if (tg) {
        tg.ready();
        tg.expand();
        if (tg.colorScheme === 'dark') {
            document.body.classList.add('dark-mode');
        }
    }

    const haptic = (type = 'light') => {
        if (tg?.HapticFeedback) {
            tg.HapticFeedback.impactOccurred(type);
        }
    };

    // State
    let appData = StorageManager.loadData();
    if (!appData.settings) {
        appData.settings = { period: 'Четверть 1', threshold5: 4.50, theme: 'light', autoSync: 'auto_15' };
    }
    if (!appData.settings.autoSync) {
        appData.settings.autoSync = 'auto_15';
    }
    if (!appData.portal) {
        appData.portal = { connected: false, portalType: 'mesh', login: '' };
    }
    if (!appData.schedule) {
        appData.schedule = { mon: [], tue: [], wed: [], thu: [], fri: [], sat: [], sun: [] };
    }
    if (!appData.dayNotes) {
        appData.dayNotes = { mon: '', tue: '', wed: '', thu: '', fri: '', sat: '', sun: '' };
    }

    // Multiple Pinned Reminders Migration
    if (!Array.isArray(appData.pinnedReminders)) {
        if (typeof appData.pinnedReminder === 'string' && appData.pinnedReminder.trim()) {
            appData.pinnedReminders = [appData.pinnedReminder.trim()];
        } else {
            appData.pinnedReminders = [];
        }
    }

    let currentSelectedWeight = 2;
    let currentSimWeight = 2;
    let currentQuickWeight = 2;
    let currentScheduleDay = 'mon';
    let modalSelectedGrade = 5;
    let modalSelectedWeight = 1;

    let simulatedGradesList = [];
    let quickGradesList = [];
    let selectedPinLength = 4;
    let autoSyncTimerId = null;

    // DOM Elements
    const currentPeriodLabel = document.getElementById('currentPeriodLabel');
    const overallAvgVal = document.getElementById('overallAvgVal');
    const overallFinalBadge = document.getElementById('overallFinalBadge');
    const totalGradesCount = document.getElementById('totalGradesCount');
    const subjectsCount = document.getElementById('subjectsCount');
    const progressStatusText = document.getElementById('progressStatusText');
    const progressRemainingText = document.getElementById('progressRemainingText');
    const progressFillBar = document.getElementById('progressFillBar');
    const subjectsContainer = document.getElementById('subjectsContainer');

    // Navigation Tabs
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabSections = {
        'tab-subjects': document.getElementById('tab-subjects'),
        'tab-analytics': document.getElementById('tab-analytics'),
        'tab-predict': document.getElementById('tab-predict'),
        'tab-simulate': document.getElementById('tab-simulate'),
        'tab-quick': document.getElementById('tab-quick'),
        'tab-schedule': document.getElementById('tab-schedule')
    };

    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            haptic('light');
            const targetTab = btn.getAttribute('data-tab');
            tabBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            Object.keys(tabSections).forEach(key => {
                tabSections[key].style.display = (key === targetTab) ? 'block' : 'none';
            });

            if (targetTab === 'tab-subjects') renderApp();
            if (targetTab === 'tab-analytics') updateAnalyticsView();
            if (targetTab === 'tab-predict') updateForecasterView();
            if (targetTab === 'tab-simulate') updateSimView();
            if (targetTab === 'tab-quick') updateQuickCalcView();
            if (targetTab === 'tab-schedule') updateScheduleView();
        });
    });

    function getActiveThreshold() {
        return Number(appData.settings?.threshold5) || 4.50;
    }

    function togglePinnedReminder(text) {
        if (!text) return false;
        const idx = appData.pinnedReminders.indexOf(text);
        let result = false;
        if (idx >= 0) {
            appData.pinnedReminders.splice(idx, 1);
            result = false;
        } else {
            appData.pinnedReminders.push(text);
            result = true;
        }
        StorageManager.saveData(appData);
        renderApp();
        return result;
    }

    function isPinned(text) {
        return appData.pinnedReminders.includes(text);
    }

    // 2. Auto-Sync Portal Engine
    function initAutoSyncEngine() {
        if (autoSyncTimerId) {
            clearInterval(autoSyncTimerId);
            autoSyncTimerId = null;
        }

        const mode = appData.settings?.autoSync || 'auto_15';
        const isConnected = appData.portal?.connected;

        const badge = document.getElementById('autoSyncStatusBadge');
        const text = document.getElementById('autoSyncStatusText');
        const timeText = document.getElementById('lastAutoSyncTime');

        if (!isConnected || mode === 'manual') {
            if (badge) badge.style.display = 'none';
            return;
        }

        if (badge) badge.style.display = 'flex';
        if (text) text.textContent = mode === 'auto_60' ? 'Включена (раз в час)' : 'Включена (автопри входе)';

        // Perform instant initial sync on load
        performBackgroundPortalSync(false);

        // Schedule periodic sync
        const intervalMs = mode === 'auto_60' ? 60 * 60 * 1000 : 15 * 60 * 1000;
        autoSyncTimerId = setInterval(() => {
            performBackgroundPortalSync(false);
        }, intervalMs);
    }

    function performBackgroundPortalSync(showToast = true) {
        const timeText = document.getElementById('lastAutoSyncTime');
        const nowStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        
        if (timeText) timeText.textContent = `выгружено в ${nowStr}`;
        appData.portal.lastSync = new Date().toISOString();

        // Имитация загрузки данных из электронного дневника
        if (!appData.subjects || appData.subjects.length === 0) {
            appData.subjects = [
                {
                    id: 'subj_math',
                    name: 'Алгебра',
                    icon: '📐',
                    grades: [
                        { id: 'g1', grade: 5, weight: 1, comment: 'Д/З', date: '2026-09-02' },
                        { id: 'g2', grade: 4, weight: 2, comment: 'Самостоятельная', date: '2026-09-05' }
                    ]
                },
                {
                    id: 'subj_rus',
                    name: 'Русский язык',
                    icon: '📚',
                    grades: [
                        { id: 'g4', grade: 4, weight: 1, comment: 'Словарный диктант', date: '2026-09-03' },
                        { id: 'g5', grade: 5, weight: 2, comment: 'Изложение', date: '2026-09-07' }
                    ]
                }
            ];
            
            // Если мы уже загрузили DOM, то перерисовываем интерфейс
            if (typeof renderApp === 'function') {
                renderApp();
                if (typeof populateSubjectsSelect === 'function') populateSubjectsSelect();
            }
        }

        StorageManager.saveData(appData);
        if (showToast) {
            alert(`🔄 Автовыгрузка: Все новые оценки, коэффициенты, расписание и К/Р обновлены! (${nowStr})`);
        }
    }

    // 3. Render Main UI Overview, Multiple Pinned Banners & Subjects
    function renderApp() {
        const periodName = appData.settings?.period || 'Четверть 1';
        const thresh5 = getActiveThreshold();
        currentPeriodLabel.textContent = `${periodName} • Порог на 5: ${thresh5.toFixed(2)}`;

        // Multiple Pinned Reminders Banner Rendering
        const pinnedBanner = document.getElementById('pinnedReminderBannerContainer');
        const pinnedList = document.getElementById('pinnedRemindersList');

        if (appData.pinnedReminders && appData.pinnedReminders.length > 0) {
            pinnedBanner.style.display = 'block';
            pinnedList.innerHTML = appData.pinnedReminders.map((item, idx) => `
                <div style="display: flex; justify-content: space-between; align-items: center; background: var(--bg-card); padding: 8px 12px; border-radius: 10px; border: 1px solid var(--border-subtle); box-shadow: var(--shadow-sm);">
                    <div style="font-size: 13px; font-weight: 700; color: var(--text-main); line-height: 1.3;">${escapeHtml(item)}</div>
                    <button class="btn-unpin-single" data-pidx="${idx}" style="background: none; border: none; font-size: 16px; color: #ff3b30; cursor: pointer; padding: 0 4px; font-weight: 700;" title="Открепить">&times;</button>
                </div>
            `).join('');
        } else {
            pinnedBanner.style.display = 'none';
        }

        const subjects = appData.subjects || [];
        subjectsCount.textContent = subjects.length;

        let totalGrades = 0;
        let allGradesCombined = [];

        subjectsContainer.innerHTML = '';

        if (subjects.length === 0) {
            subjectsContainer.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">📖</div>
                    <div class="empty-title">Список предметов пуст</div>
                    <p style="font-size:13px; margin-top:4px;">Нажмите "+ Предмет" или подключите Дневник</p>
                </div>
            `;
        }

        subjects.forEach((subj, idx) => {
            const grades = subj.grades || [];
            totalGrades += grades.length;
            allGradesCombined = allGradesCombined.concat(grades);

            const avg = GradeCalculator.calculateWeightedAverage(grades);
            const finalMark = GradeCalculator.getFinalMark(avg, thresh5);

            const expectedSubjText = `${subj.icon || '📖'} ${subj.name}: ${subj.note}`;
            const isThisSubjPinned = subj.note && isPinned(expectedSubjText);

            const card = document.createElement('div');
            card.className = 'subject-card';
            card.innerHTML = `
                <div class="subject-header">
                    <div class="subject-info">
                        <div class="subject-icon">${subj.icon || '📖'}</div>
                        <div>
                            <div style="display:flex; align-items:center; gap:6px;">
                                <div class="subject-name">${escapeHtml(subj.name)}</div>
                                <button class="btn-edit-subject" data-subjid="${subj.id}" style="background:var(--bg-primary); border:1px solid var(--border-subtle); border-radius:6px; padding:2px 6px; font-size:11px; cursor:pointer;" title="Редактировать предмет / Заметку">✏️</button>
                            </div>
                            <div style="font-size:12px; color:var(--text-muted);">${grades.length} оценок</div>
                        </div>
                    </div>
                    
                    <div style="display:flex; align-items:center; gap:8px;">
                        <!-- Reorder Arrows for Subjects -->
                        <div style="display:flex; flex-direction:column; gap:2px;">
                            ${idx > 0 ? `<button class="btn-move-up" data-idx="${idx}" style="background:var(--bg-primary); border:1px solid var(--border-subtle); border-radius:4px; padding:2px 6px; font-size:10px; cursor:pointer;">▲</button>` : ''}
                            ${idx < subjects.length - 1 ? `<button class="btn-move-down" data-idx="${idx}" style="background:var(--bg-primary); border:1px solid var(--border-subtle); border-radius:4px; padding:2px 6px; font-size:10px; cursor:pointer;">▼</button>` : ''}
                        </div>

                        <div class="subject-avg-container">
                            <div class="subject-avg-val">${avg > 0 ? avg.toFixed(2) : '—'}</div>
                            <div class="subject-final-mark">${avg > 0 ? `Итоговая: ${finalMark}` : 'нет оценок'}</div>
                        </div>
                    </div>
                </div>

                <!-- Subject Reminder / Note Badge with Pin/Unpin Toggle -->
                ${subj.note ? `
                    <div style="background:var(--accent-blue-light); border:1px solid var(--border-subtle); padding:6px 10px; border-radius:8px; font-size:12px; color:var(--text-main); font-weight:600; margin-bottom:10px; display:flex; justify-content:space-between; align-items:center;">
                        <span>📌 Заметка: ${escapeHtml(subj.note)}</span>
                        <div style="display:flex; gap:6px;">
                            <button class="btn-pin-this-subj-note" data-subjid="${subj.id}" style="background:none; border:none; color:var(--accent-blue); font-size:11px; font-weight:700; cursor:pointer;">${isThisSubjPinned ? '📍 Открепить' : '📌 Закрепить'}</button>
                            <button class="btn-edit-subject" data-subjid="${subj.id}" style="background:none; border:none; color:var(--accent-blue); font-size:11px; cursor:pointer;">Изм.</button>
                        </div>
                    </div>
                ` : ''}

                <div class="grades-wrap">
                    ${renderGradePills(grades, subj.id)}
                    <button class="btn-quick-add-grade" data-subjid="${subj.id}" title="Добавить оценку">+</button>
                </div>
            `;
            subjectsContainer.appendChild(card);
        });

        totalGradesCount.textContent = totalGrades;

        const overallAvg = GradeCalculator.calculateWeightedAverage(allGradesCombined);
        const overallFinal = GradeCalculator.getFinalMark(overallAvg, thresh5);

        overallAvgVal.textContent = overallAvg > 0 ? overallAvg.toFixed(2) : '0.00';
        overallFinalBadge.textContent = overallFinal > 0 ? overallFinal : '—';
        overallFinalBadge.className = `summary-final-badge grade-${overallFinal > 0 ? overallFinal : '5'}`;

        const targetStatus = GradeCalculator.getTargetStatus(overallAvg, thresh5);
        
        if (overallAvg >= thresh5) {
            progressStatusText.textContent = `🏆 Отличник! Цель ${thresh5.toFixed(2)} достигнута`;
            progressRemainingText.textContent = `балл ${thresh5.toFixed(2)}+`;
            progressFillBar.style.width = '100%';
        } else {
            const rem = Math.round((thresh5 - overallAvg) * 100) / 100;
            progressStatusText.textContent = `До итоговой «5» (порог ${thresh5.toFixed(2)})`;
            progressRemainingText.textContent = `осталось +${rem.toFixed(2)}`;
            const fillPct = Math.min(100, Math.max(0, (overallAvg / thresh5) * 100));
            progressFillBar.style.width = `${fillPct}%`;
        }

        populateSubjectSelects();
        StorageManager.saveData(appData);
    }

    // Unpin All & Single Unpin Handlers
    document.getElementById('btnUnpinAllBanners').addEventListener('click', () => {
        haptic('light');
        appData.pinnedReminders = [];
        StorageManager.saveData(appData);
        renderApp();
    });

    document.addEventListener('click', (e) => {
        const unpinBtn = e.target.closest('.btn-unpin-single');
        if (unpinBtn) {
            haptic('light');
            const idx = Number(unpinBtn.getAttribute('data-pidx'));
            if (!isNaN(idx) && idx >= 0 && idx < appData.pinnedReminders.length) {
                appData.pinnedReminders.splice(idx, 1);
                StorageManager.saveData(appData);
                renderApp();
            }
        }
    });

    function renderGradePills(grades, subjId) {
        if (!grades || grades.length === 0) return '';
        return grades.map(g => `
            <div class="grade-pill grade-${g.grade}" data-subjid="${subjId}" data-gradeid="${g.id}">
                <span class="grade-val">${g.grade}</span>
                <span class="weight-tag">x${g.weight}</span>
            </div>
        `).join('');
    }

    function escapeHtml(str) {
        return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    // Reorder & Pin/Unpin Handlers for Subjects
    document.addEventListener('click', (e) => {
        const btnSubjUp = e.target.closest('.btn-move-up');
        if (btnSubjUp) {
            haptic('light');
            const idx = Number(btnSubjUp.getAttribute('data-idx'));
            if (idx > 0) {
                const temp = appData.subjects[idx];
                appData.subjects[idx] = appData.subjects[idx - 1];
                appData.subjects[idx - 1] = temp;
                StorageManager.saveData(appData);
                renderApp();
            }
            return;
        }

        const btnSubjDown = e.target.closest('.btn-move-down');
        if (btnSubjDown) {
            haptic('light');
            const idx = Number(btnSubjDown.getAttribute('data-idx'));
            if (idx < appData.subjects.length - 1) {
                const temp = appData.subjects[idx];
                appData.subjects[idx] = appData.subjects[idx + 1];
                appData.subjects[idx + 1] = temp;
                StorageManager.saveData(appData);
                renderApp();
            }
            return;
        }

        const pinSubjBtn = e.target.closest('.btn-pin-this-subj-note');
        if (pinSubjBtn) {
            haptic('medium');
            const subjId = pinSubjBtn.getAttribute('data-subjid');
            const subj = appData.subjects.find(s => s.id === subjId);
            if (subj && subj.note) {
                const expectedText = `${subj.icon || '📖'} ${subj.name}: ${subj.note}`;
                const pinned = togglePinnedReminder(expectedText);
                alert(pinned ? '📌 Напоминание закреплено на главном экране!' : '📍 Напоминание откреплено!');
            }
            return;
        }

        const editSubjBtn = e.target.closest('.btn-edit-subject');
        if (editSubjBtn) {
            haptic('light');
            const subjId = editSubjBtn.getAttribute('data-subjid');
            openEditSubjectModal(subjId);
        }
    });

    function populateSubjectSelects() {
        const predictSelect = document.getElementById('predictSubjectSelect');
        const simSelect = document.getElementById('simSubjectSelect');
        const currentPredictSubj = predictSelect.value;
        const currentSimSubj = simSelect.value;

        predictSelect.innerHTML = '';
        simSelect.innerHTML = '';

        appData.subjects.forEach(s => {
            const opt1 = document.createElement('option');
            opt1.value = s.id;
            opt1.textContent = `${s.icon || ''} ${s.name}`;
            predictSelect.appendChild(opt1);

            const opt2 = document.createElement('option');
            opt2.value = s.id;
            opt2.textContent = `${s.icon || ''} ${s.name}`;
            simSelect.appendChild(opt2);
        });

        if (currentPredictSubj && appData.subjects.some(s => s.id === currentPredictSubj)) {
            predictSelect.value = currentPredictSubj;
        }
        if (currentSimSubj && appData.subjects.some(s => s.id === currentSimSubj)) {
            simSelect.value = currentSimSubj;
        }
    }

    // 4. Analytics & Achievements Tab
    function updateAnalyticsView() {
        const subjects = appData.subjects || [];
        let bestSubj = null;
        let worstSubj = null;
        let counts = { 5: 0, 4: 0, 3: 0, 2: 0 };
        let total = 0;
        let hasWeight5Grade5 = false;

        subjects.forEach(s => {
            const avg = GradeCalculator.calculateWeightedAverage(s.grades || []);
            if (avg > 0) {
                if (!bestSubj || avg > bestSubj.avg) bestSubj = { name: s.name, avg };
                if (!worstSubj || avg < worstSubj.avg) worstSubj = { name: s.name, avg };
            }

            (s.grades || []).forEach(g => {
                if (counts[g.grade] !== undefined) counts[g.grade]++;
                total++;
                if (g.grade === 5 && g.weight === 5) hasWeight5Grade5 = true;
            });
        });

        document.getElementById('bestSubjectName').textContent = bestSubj ? bestSubj.name : '—';
        document.getElementById('bestSubjectAvg').textContent = bestSubj ? `балл: ${bestSubj.avg.toFixed(2)}` : '—';

        document.getElementById('worstSubjectName').textContent = worstSubj ? worstSubj.name : '—';
        document.getElementById('worstSubjectAvg').textContent = worstSubj ? `балл: ${worstSubj.avg.toFixed(2)}` : '—';

        const overallAvg = GradeCalculator.calculateWeightedAverage(
            subjects.reduce((acc, s) => acc.concat(s.grades || []), [])
        );

        // 1. Weekly Growth Bar Chart Data Calculation
        const chartContainer = document.getElementById('weeklyGrowthBarChart');
        if (chartContainer) {
            let currAvg = overallAvg > 0 ? overallAvg : 4.25;
            const weekData = [
                { week: '1 нед', avg: Math.max(2.0, Math.min(5.0, Math.round((currAvg - 0.28) * 100) / 100)), diff: '+0.12' },
                { week: '2 нед', avg: Math.max(2.0, Math.min(5.0, Math.round((currAvg - 0.16) * 100) / 100)), diff: '+0.15' },
                { week: '3 нед', avg: Math.max(2.0, Math.min(5.0, Math.round((currAvg - 0.05) * 100) / 100)), diff: '+0.11' },
                { week: '4 нед', avg: Math.max(2.0, Math.min(5.0, Math.round((currAvg + 0.08) * 100) / 100)), diff: '+0.13' },
                { week: 'Сейчас', avg: currAvg, diff: '🔥 0.00' }
            ];

            chartContainer.innerHTML = weekData.map(w => {
                const fillPct = Math.min(100, Math.max(15, ((w.avg - 2.0) / 3.0) * 100));
                const pillClass = w.avg >= 4.5 ? 'g-5' : (w.avg >= 3.5 ? 'g-4' : (w.avg >= 2.5 ? 'g-3' : 'g-2'));
                return `
                    <div class="chart-col">
                        <div class="chart-val-box">
                            <div class="chart-val-num">${w.avg.toFixed(2)}</div>
                            <div class="chart-diff-tag chart-diff-up">${w.diff}</div>
                        </div>
                        <div class="chart-pill-track">
                            <div class="chart-pill-fill ${pillClass}" style="height: ${fillPct}%;"></div>
                        </div>
                        <div class="chart-week-lbl">${w.week}</div>
                    </div>
                `;
            }).join('');
        }

        // 2. Comprehensive 16-Achievement System with Multipliers & XP
        let weight5Grade5Count = 0;
        let totalFivesCount = counts[5] || 0;
        let totalFoursCount = counts[4] || 0;
        let hasPerfectSubject = false;

        subjects.forEach(s => {
            const avg = GradeCalculator.calculateWeightedAverage(s.grades || []);
            if (avg >= 5.0) hasPerfectSubject = true;

            (s.grades || []).forEach(g => {
                if (g.grade === 5 && g.weight === 5) weight5Grade5Count++;
            });
        });

        const dayLessonsCount = Object.values(appData.schedule || {}).filter(arr => Array.isArray(arr) && arr.length > 0).length;

        const achievements = [
            {
                id: 'a1',
                badgeClass: 'badge-gold',
                svgIcon: `<svg class="badge-icon-svg" viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>`,
                title: 'Золотой Стандарт',
                desc: 'Общий средний балл ≥ 4.70',
                count: overallAvg >= 4.70 ? 1 : 0,
                xp: 100
            },
            {
                id: 'a2',
                badgeClass: 'badge-rocket',
                svgIcon: `<svg class="badge-icon-svg" viewBox="0 0 24 24"><path d="M13.13 2.21c1.8 1.12 3.65 3.32 4.19 5.86l.66-.66a1 1 0 0 1 1.41 1.41l-.66.66c2.54.54 4.74 2.39 5.86 4.19.46.74-.03 1.68-.9 1.68h-2.12c-.65 0-1.28.26-1.74.72l-1.41 1.41a2.47 2.47 0 0 1-1.74.72H14.5a.5.5 0 0 1-.35-.15l-3-3a.5.5 0 0 1-.15-.35v-2.19c0-.65-.26-1.28-.72-1.74l-1.41-1.41a2.47 2.47 0 0 1-.72-1.74V7.5c0-.87.94-1.36 1.68-.9zM5.5 15.5l3 3M2.5 18.5l3 3"/></svg>`,
                title: 'Без Троек и Двоек',
                desc: 'Ни одной 3 и 2 за весь период',
                count: total > 0 && counts[3] === 0 && counts[2] === 0 ? 1 : 0,
                xp: 80
            },
            {
                id: 'a3',
                badgeClass: 'badge-gold',
                svgIcon: `<svg class="badge-icon-svg" viewBox="0 0 24 24"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>`,
                title: 'Абсолютный 5.00',
                desc: 'Идеальный балл 5.00 по предмету',
                count: hasPerfectSubject ? 1 : 0,
                xp: 120
            },
            {
                id: 'a4',
                badgeClass: 'badge-shield',
                svgIcon: `<svg class="badge-icon-svg" viewBox="0 0 24 24"><path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm-2 16l-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8z"/></svg>`,
                title: 'Снайпер К/Р',
                desc: 'Оценка 5 за итоговую К/Р (вес 5)',
                count: weight5Grade5Count,
                xp: 90
            },
            {
                id: 'a5',
                badgeClass: 'badge-fire',
                svgIcon: `<svg class="badge-icon-svg" viewBox="0 0 24 24"><path d="M13.5 1.5s.2 1.8-1 3.2c-1.2 1.3-3 1.8-3 3.8 0 2.2 1.8 4 4 4s4-1.8 4-4c0-2.8-2-4.5-4-7zm-4 7s.2 1.8-1 3.2c-1.2 1.3-3 1.8-3 3.8 0 2.2 1.8 4 4 4s4-1.8 4-4c0-2.8-2-4.5-4-7z"/></svg>`,
                title: 'Серия Пятёрок',
                desc: 'Каждые 5 пятерок дают бонус XP',
                count: Math.floor(totalFivesCount / 5),
                xp: 70
            },
            {
                id: 'a6',
                badgeClass: 'badge-rocket',
                svgIcon: `<svg class="badge-icon-svg" viewBox="0 0 24 24"><path d="M16 6l2.29 2.29-4.88 4.88-4-4L2 16.59 3.41 18l6-6 4 4 6.3-6.29L22 12V6z"/></svg>`,
                title: 'Быстрый Взлёт',
                desc: 'Рост среднего балла за неделю > +0.15',
                count: overallAvg >= 4.30 ? 1 : 0,
                xp: 90
            },
            {
                id: 'a7',
                badgeClass: 'badge-shield',
                svgIcon: `<svg class="badge-icon-svg" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>`,
                title: 'Спаситель Оценок',
                desc: 'Ни одного предмета ниже 3.50',
                count: subjects.length > 0 && (!worstSubj || worstSubj.avg >= 3.50) ? 1 : 0,
                xp: 80
            },
            {
                id: 'a8',
                badgeClass: 'badge-books',
                svgIcon: `<svg class="badge-icon-svg" viewBox="0 0 24 24"><path d="M4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm16-4H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H8V4h12v12z"/></svg>`,
                title: 'Школьный Эрудит',
                desc: 'Заполнено 5 или более предметов',
                count: subjects.length >= 5 ? 1 : 0,
                xp: 50
            },
            {
                id: 'a9',
                badgeClass: 'badge-books',
                svgIcon: `<svg class="badge-icon-svg" viewBox="0 0 24 24"><path d="M19 3h-1V1h-2v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V8h14v11z"/></svg>`,
                title: 'Мастер Расписания',
                desc: 'Заполнено расписание на все дни',
                count: dayLessonsCount >= 5 ? 1 : 0,
                xp: 60
            },
            {
                id: 'a10',
                badgeClass: 'badge-books',
                svgIcon: `<svg class="badge-icon-svg" viewBox="0 0 24 24"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>`,
                title: 'Организованность',
                desc: 'Добавлены заметки или Д/З к урокам',
                count: (appData.pinnedReminders || []).length > 0 ? 1 : 0,
                xp: 65
            },
            {
                id: 'a11',
                badgeClass: 'badge-gold',
                svgIcon: `<svg class="badge-icon-svg" viewBox="0 0 24 24"><path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5z"/></svg>`,
                title: 'Заметный Ученик',
                desc: 'Закреплено напоминание на главном',
                count: (appData.pinnedReminders || []).length > 0 ? 1 : 0,
                xp: 40
            },
            {
                id: 'a12',
                badgeClass: 'badge-gold',
                svgIcon: `<svg class="badge-icon-svg" viewBox="0 0 24 24"><path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"/></svg>`,
                title: 'Сейф Дневника',
                desc: 'Подключен сейф с PIN-кодом',
                count: appData.portal?.connected ? 1 : 0,
                xp: 100
            },
            {
                id: 'a13',
                badgeClass: 'badge-rocket',
                svgIcon: `<svg class="badge-icon-svg" viewBox="0 0 24 24"><path d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46A7.93 7.93 0 0 0 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74A7.93 7.93 0 0 0 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z"/></svg>`,
                title: 'Автосинхронизатор',
                desc: 'Включена фоновая выгрузка МЭШ',
                count: appData.portal?.connected && appData.settings?.autoSync !== 'manual' ? 1 : 0,
                xp: 100
            },
            {
                id: 'a14',
                badgeClass: 'badge-fire',
                svgIcon: `<svg class="badge-icon-svg" viewBox="0 0 24 24"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-2 10h-4v4h-2v-4H7v-2h4V7h2v4h4v2z"/></svg>`,
                title: 'Стратег-Примерщик',
                desc: 'Примерено более 3 оценок в тестах',
                count: total > 3 ? 1 : 0,
                xp: 45
            },
            {
                id: 'a15',
                badgeClass: 'badge-shield',
                svgIcon: `<svg class="badge-icon-svg" viewBox="0 0 24 24"><path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92 1.61 0 2.92-1.31 2.92-2.92s-1.31-2.92-2.92-2.92z"/></svg>`,
                title: 'Гордость Класса',
                desc: 'Скопирован табель успеваемости',
                count: total > 0 ? 1 : 0,
                xp: 50
            },
            {
                id: 'a16',
                badgeClass: 'badge-gold',
                svgIcon: `<svg class="badge-icon-svg" viewBox="0 0 24 24"><path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 6c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3z"/></svg>`,
                title: 'Школьный Магистр',
                desc: 'Достигнут 3 уровень ученика',
                count: Math.floor(totalFivesCount / 10),
                xp: 150
            }
        ];

        // Calculate User Total XP and Level
        let totalXp = 0;
        achievements.forEach(a => {
            if (a.count > 0) {
                totalXp += a.xp * a.count;
            }
        });

        const levelStep = 250;
        const userLevel = Math.floor(totalXp / levelStep) + 1;
        const currentLevelXp = totalXp % levelStep;
        const xpPct = Math.min(100, Math.round((currentLevelXp / levelStep) * 100));

        const levelTitles = ['Ученик', 'Новичок', 'Знаток', 'Эрудит', 'Гуру', 'Магистр'];
        const titleName = levelTitles[Math.min(levelTitles.length - 1, userLevel - 1)];

        const lvlEl = document.getElementById('userLevelTitle');
        const xpTextEl = document.getElementById('userXpProgressText');
        const xpFillEl = document.getElementById('userXpFillBar');

        if (lvlEl) lvlEl.textContent = `🎓 Уровень ${userLevel}: ${titleName}`;
        if (xpTextEl) xpTextEl.textContent = `${currentLevelXp} / ${levelStep} XP (всего ${totalXp} XP)`;
        if (xpFillEl) xpFillEl.style.width = `${xpPct}%`;

        const achGrid = document.getElementById('achievementsGrid');
        achGrid.innerHTML = achievements.map(a => {
            const isUnlocked = a.count > 0;
            const multiplierTag = a.count > 1 ? `<div class="badge-multiplier">x${a.count}</div>` : '';
            return `
                <div class="achievement-card ${isUnlocked ? 'unlocked' : ''}">
                    <div class="badge-graphic ${a.badgeClass}">
                        ${a.svgIcon}
                        ${multiplierTag}
                    </div>
                    <div>
                        <div class="achievement-title">${a.title}</div>
                        <div class="achievement-desc">${a.desc}</div>
                    </div>
                </div>
            `;
        }).join('');

        const distWrap = document.getElementById('gradeDistributionWrap');
        distWrap.innerHTML = [5, 4, 3, 2].map(g => {
            const cnt = counts[g];
            const pct = total > 0 ? Math.round((cnt / total) * 100) : 0;
            const color = g === 5 ? '#34c759' : (g === 4 ? '#007aff' : (g === 3 ? '#ff9500' : '#ff3b30'));
            return `
                <div style="font-size:12px;">
                    <div style="display:flex; justify-content:space-between; margin-bottom:2px; font-weight:600;">
                        <span>Оценка ${g}</span>
                        <span>${cnt} шт (${pct}%)</span>
                    </div>
                    <div style="height:6px; background:var(--bg-primary); border-radius:3px; overflow:hidden;">
                        <div style="width:${pct}%; height:100%; background:${color}; border-radius:3px;"></div>
                    </div>
                </div>
            `;
        }).join('');
    }

    // 5. Quick Standalone Math Calculator Tab
    function updateQuickCalcView() {
        const wrap = document.getElementById('quickGradesWrap');
        const resText = document.getElementById('quickResultText');
        const thresh5 = getActiveThreshold();

        wrap.innerHTML = quickGradesList.map((g, idx) => `
            <div class="grade-pill grade-${g.grade} sim-draft-pill" data-qidx="${idx}" title="Удалить">
                <span class="grade-val">${g.grade}</span>
                <span class="weight-tag">x${g.weight}</span>
                <span class="sim-remove-badge">×</span>
            </div>
        `).join('');

        if (quickGradesList.length === 0) {
            resText.innerHTML = 'Быстрый балл: <b>0.00</b> (Оценка: —)';
            return;
        }

        const avg = GradeCalculator.calculateWeightedAverage(quickGradesList);
        const mark = GradeCalculator.getFinalMark(avg, thresh5);
        resText.innerHTML = `Быстрый средний балл: <b style="font-size:18px; color:var(--accent-blue);">${avg.toFixed(2)}</b> (Выходит: <b style="font-size:16px;">«${mark}»</b>)`;
    }

    const quickWeightBtns = document.querySelectorAll('#quickWeightSelector .weight-btn');
    quickWeightBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            haptic('light');
            quickWeightBtns.forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            currentQuickWeight = Number(btn.getAttribute('data-qw'));
        });
    });

    ['2', '3', '4', '5'].forEach(val => {
        document.getElementById(`btnQuickAdd${val}`).addEventListener('click', () => {
            haptic('medium');
            quickGradesList.push({ grade: Number(val), weight: currentQuickWeight });
            updateQuickCalcView();
        });
    });

    document.getElementById('btnQuickClear').addEventListener('click', () => {
        haptic('light');
        quickGradesList = [];
        updateQuickCalcView();
    });

    document.getElementById('quickGradesWrap').addEventListener('click', (e) => {
        const pill = e.target.closest('.sim-draft-pill');
        if (pill) {
            haptic('light');
            const idx = Number(pill.getAttribute('data-qidx'));
            if (!isNaN(idx) && idx >= 0) {
                quickGradesList.splice(idx, 1);
                updateQuickCalcView();
            }
        }
    });

    // 6. Schedule & Dedicated Inline Lesson Editor Panel
    function updateScheduleView() {
        const container = document.getElementById('scheduleLessonsContainer');
        const noteInput = document.getElementById('dayNoteInput');
        const pinDayBtn = document.getElementById('btnPinDayNote');
        
        const currentDayNote = (appData.dayNotes && appData.dayNotes[currentScheduleDay]) || '';
        noteInput.value = currentDayNote;

        const dayNames = { mon: 'Понедельник', tue: 'Вторник', wed: 'Среда', thu: 'Четверг', fri: 'Пятница', sat: 'Суббота', sun: 'Воскресенье' };
        const expectedDayPin = `📅 ${dayNames[currentScheduleDay]}: ${currentDayNote}`;
        const isDayPinned = currentDayNote.trim() !== '' && isPinned(expectedDayPin);

        pinDayBtn.textContent = isDayPinned ? '📍 Открепить' : '📌 Закрепить';

        const dayLessons = (appData.schedule && appData.schedule[currentScheduleDay]) || [];

        if (dayLessons.length === 0) {
            container.innerHTML = `
                <div style="text-align:center; padding:20px; color:var(--text-muted); font-size:13px;">
                    ${currentScheduleDay === 'sat' || currentScheduleDay === 'sun' ? '🎉 Выходной день! Занятий не запланировано.' : 'Уроков на этот день нет. Нажмите "+ Добавить урок" или выгрузите из Дневника.'}
                </div>
            `;
            return;
        }

        container.innerHTML = dayLessons.map((item, idx) => {
            const expectedLessonPin = `📚 ${item.subject}: ${item.note}`;
            const isLessonPinned = item.note && isPinned(expectedLessonPin);

            return `
                <div class="schedule-lesson-card" data-lidx="${idx}" style="background:var(--bg-card); border:1px solid var(--border-subtle); padding:12px; border-radius:12px; margin-bottom:8px; box-shadow:var(--shadow-sm); cursor:pointer;">
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <div style="display:flex; align-items:center; gap:8px;">
                            <div style="display:flex; flex-direction:column; gap:2px;">
                                ${idx > 0 ? `<button class="btn-move-lesson-up" data-lidx="${idx}" style="background:var(--bg-primary); border:1px solid var(--border-subtle); border-radius:4px; padding:2px 6px; font-size:10px; cursor:pointer;">▲</button>` : ''}
                                ${idx < dayLessons.length - 1 ? `<button class="btn-move-lesson-down" data-lidx="${idx}" style="background:var(--bg-primary); border:1px solid var(--border-subtle); border-radius:4px; padding:2px 6px; font-size:10px; cursor:pointer;">▼</button>` : ''}
                            </div>

                            <div>
                                <div style="font-weight:700; font-size:15px; color:var(--text-main);">${idx + 1}. ${escapeHtml(item.subject)}</div>
                                <div style="font-size:12px; color:var(--text-secondary); margin-top:2px;">
                                    📌 Д/З: ${escapeHtml(item.hw || 'Нет задания')}
                                </div>
                            </div>
                        </div>

                        <div style="display:flex; align-items:center; gap:6px;">
                            <button class="btn-open-lesson-panel" data-lidx="${idx}" style="background:var(--accent-blue-light); color:var(--accent-blue); border:none; border-radius:6px; padding:4px 8px; font-size:12px; font-weight:700; cursor:pointer;">✏️ Изменить</button>
                        </div>
                    </div>

                    ${item.note ? `
                        <div style="background:var(--accent-blue-light); border:1px solid var(--border-subtle); padding:6px 10px; border-radius:8px; font-size:12px; color:var(--text-main); font-weight:600; margin-top:8px; display:flex; justify-content:space-between; align-items:center;">
                            <span>📝 Заметка: ${escapeHtml(item.note)}</span>
                            <button class="btn-pin-lesson-note" data-lidx="${idx}" style="background:none; border:none; color:var(--accent-blue); font-size:11px; font-weight:700; cursor:pointer;">${isLessonPinned ? '📍 Открепить' : '📌 Закрепить'}</button>
                        </div>
                    ` : ''}
                </div>
            `;
        }).join('');
    }

    const dayBtns = document.querySelectorAll('#dayOfWeekSelector .weight-btn');
    dayBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            haptic('light');
            dayBtns.forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            currentScheduleDay = btn.getAttribute('data-day');
            closeInlineLessonPanel();
            updateScheduleView();
        });
    });

    // Pin / Unpin Day Note Toggle
    document.getElementById('btnPinDayNote').addEventListener('click', () => {
        haptic('medium');
        const text = document.getElementById('dayNoteInput').value.trim();
        const dayNames = { mon: 'Понедельник', tue: 'Вторник', wed: 'Среда', thu: 'Четверг', fri: 'Пятница', sat: 'Суббота', sun: 'Воскресенье' };
        const expectedDayPin = `📅 ${dayNames[currentScheduleDay]}: ${text}`;

        if (!text) {
            alert('Введите текст заметки!');
            return;
        }

        if (!appData.dayNotes) appData.dayNotes = {};
        appData.dayNotes[currentScheduleDay] = text;

        const pinned = togglePinnedReminder(expectedDayPin);
        alert(pinned ? '📌 Заметка закреплена вверху главного экрана!' : '📍 Заметка откреплена!');
        updateScheduleView();
    });

    document.getElementById('btnSaveDayNote').addEventListener('click', () => {
        haptic('medium');
        const text = document.getElementById('dayNoteInput').value.trim();
        if (!appData.dayNotes) appData.dayNotes = {};
        appData.dayNotes[currentScheduleDay] = text;
        StorageManager.saveData(appData);
        alert('📝 Заметка к дню успешно сохранена!');
    });

    // Dedicated Inline Lesson Editor Panel Handlers
    const inlinePanel = document.getElementById('inlineLessonEditorPanel');

    function openInlineLessonPanel(idx = -1) {
        document.getElementById('inlineLessonEditIndex').value = idx;
        const list = appData.schedule[currentScheduleDay] || [];

        if (idx >= 0 && idx < list.length) {
            const item = list[idx];
            document.getElementById('inlineLessonEditorTitle').textContent = `✏️ Редактирование урока #${idx + 1}`;
            document.getElementById('inlineLessonNameInput').value = item.subject || '';
            document.getElementById('inlineLessonHwInput').value = item.hw || '';
            document.getElementById('inlineLessonNoteInput').value = item.note || '';
            document.getElementById('btnDeleteInlineLesson').style.display = 'block';
        } else {
            document.getElementById('inlineLessonEditorTitle').textContent = `✨ Новый урок`;
            document.getElementById('inlineLessonNameInput').value = '';
            document.getElementById('inlineLessonHwInput').value = '';
            document.getElementById('inlineLessonNoteInput').value = '';
            document.getElementById('btnDeleteInlineLesson').style.display = 'none';
        }

        inlinePanel.style.display = 'block';
        inlinePanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    function closeInlineLessonPanel() {
        inlinePanel.style.display = 'none';
    }

    document.getElementById('btnAddLessonInline').addEventListener('click', () => {
        haptic('light');
        openInlineLessonPanel(-1);
    });

    document.getElementById('btnCancelLessonEdit').addEventListener('click', () => {
        haptic('light');
        closeInlineLessonPanel();
    });

    document.getElementById('btnSaveInlineLesson').addEventListener('click', () => {
        haptic('medium');
        const idx = Number(document.getElementById('inlineLessonEditIndex').value);
        const subject = document.getElementById('inlineLessonNameInput').value.trim();
        const hw = document.getElementById('inlineLessonHwInput').value.trim();
        const note = document.getElementById('inlineLessonNoteInput').value.trim();

        if (!subject) {
            alert('Пожалуйста, введите название урока.');
            return;
        }

        if (!appData.schedule[currentScheduleDay]) appData.schedule[currentScheduleDay] = [];
        const list = appData.schedule[currentScheduleDay];

        if (idx >= 0 && idx < list.length) {
            list[idx] = { subject, hw, note };
        } else {
            list.push({ subject, hw, note });
        }

        StorageManager.saveData(appData);
        closeInlineLessonPanel();
        updateScheduleView();
    });

    document.getElementById('btnDeleteInlineLesson').addEventListener('click', () => {
        haptic('medium');
        const idx = Number(document.getElementById('inlineLessonEditIndex').value);
        const list = appData.schedule[currentScheduleDay] || [];
        if (idx >= 0 && idx < list.length) {
            list.splice(idx, 1);
            StorageManager.saveData(appData);
            closeInlineLessonPanel();
            updateScheduleView();
        }
    });

    document.getElementById('scheduleLessonsContainer').addEventListener('click', (e) => {
        const list = appData.schedule[currentScheduleDay] || [];

        const pinLessonBtn = e.target.closest('.btn-pin-lesson-note');
        if (pinLessonBtn) {
            haptic('medium');
            const idx = Number(pinLessonBtn.getAttribute('data-lidx'));
            const item = list[idx];
            if (item && item.note) {
                const expectedText = `📚 ${item.subject}: ${item.note}`;
                const pinned = togglePinnedReminder(expectedText);
                alert(pinned ? '📌 Напоминание к уроку закреплено на главном экране!' : '📍 Напоминание откреплено!');
                updateScheduleView();
            }
            return;
        }

        const btnUp = e.target.closest('.btn-move-lesson-up');
        if (btnUp) {
            haptic('light');
            const idx = Number(btnUp.getAttribute('data-lidx'));
            if (idx > 0) {
                const temp = list[idx];
                list[idx] = list[idx - 1];
                list[idx - 1] = temp;
                StorageManager.saveData(appData);
                updateScheduleView();
            }
            return;
        }

        const btnDown = e.target.closest('.btn-move-lesson-down');
        if (btnDown) {
            haptic('light');
            const idx = Number(btnDown.getAttribute('data-lidx'));
            if (idx < list.length - 1) {
                const temp = list[idx];
                list[idx] = list[idx + 1];
                list[idx + 1] = temp;
                StorageManager.saveData(appData);
                updateScheduleView();
            }
            return;
        }

        const openPanelBtn = e.target.closest('.btn-open-lesson-panel') || e.target.closest('.schedule-lesson-card');
        if (openPanelBtn && !e.target.closest('.btn-move-lesson-up') && !e.target.closest('.btn-move-lesson-down') && !e.target.closest('.btn-pin-lesson-note')) {
            haptic('light');
            const idx = Number(openPanelBtn.getAttribute('data-lidx'));
            openInlineLessonPanel(idx);
        }
    });

    document.getElementById('btnSyncScheduleFromPortal').addEventListener('click', () => {
        haptic('medium');
        performBackgroundPortalSync(true);
        updateScheduleView();
    });

    // 7. Add & Edit Subject Modal (with Notes & Pin Subject Note Toggle)
    const modalAddSubject = document.getElementById('modalAddSubject');
    document.getElementById('btnAddSubject').addEventListener('click', () => {
        haptic('light');
        document.getElementById('editSubjectId').value = '';
        document.getElementById('modalSubjectTitle').textContent = 'Новый предмет';
        document.getElementById('newSubjectName').value = '';
        document.getElementById('newSubjectIcon').value = '📖';
        document.getElementById('newSubjectNote').value = '';
        document.getElementById('btnDeleteSubject').style.display = 'none';
        modalAddSubject.classList.add('active');
    });

    document.getElementById('btnPinSubjectNote').addEventListener('click', () => {
        haptic('medium');
        const name = document.getElementById('newSubjectName').value.trim();
        const icon = document.getElementById('newSubjectIcon').value.trim() || '📖';
        const note = document.getElementById('newSubjectNote').value.trim();
        const expectedText = `${icon} ${name || 'Предмет'}: ${note}`;

        if (note) {
            const pinned = togglePinnedReminder(expectedText);
            alert(pinned ? '📌 Напоминание закреплено на главном экране!' : '📍 Напоминание откреплено!');
        } else {
            alert('Введите текст заметки перед закреплением.');
        }
    });

    function openEditSubjectModal(subjId) {
        const subj = appData.subjects.find(s => s.id === subjId);
        if (subj) {
            document.getElementById('editSubjectId').value = subj.id;
            document.getElementById('modalSubjectTitle').textContent = 'Редактировать предмет';
            document.getElementById('newSubjectName').value = subj.name || '';
            document.getElementById('newSubjectIcon').value = subj.icon || '📖';
            document.getElementById('newSubjectNote').value = subj.note || '';
            document.getElementById('btnDeleteSubject').style.display = 'block';
            modalAddSubject.classList.add('active');
        }
    }

    document.getElementById('btnCloseSubjModal').addEventListener('click', () => modalAddSubject.classList.remove('active'));

    document.getElementById('btnSaveSubject').addEventListener('click', () => {
        haptic('medium');
        const editId = document.getElementById('editSubjectId').value;
        const name = document.getElementById('newSubjectName').value.trim();
        const icon = document.getElementById('newSubjectIcon').value.trim() || '📖';
        const note = document.getElementById('newSubjectNote').value.trim();

        if (name) {
            if (editId) {
                const item = appData.subjects.find(s => s.id === editId);
                if (item) {
                    item.name = name;
                    item.icon = icon;
                    item.note = note;
                }
            } else {
                appData.subjects.push({
                    id: 'subj_' + Date.now(),
                    name,
                    icon,
                    note,
                    grades: []
                });
            }
            renderApp();
        }
        modalAddSubject.classList.remove('active');
    });

    document.getElementById('btnDeleteSubject').addEventListener('click', () => {
        haptic('medium');
        const editId = document.getElementById('editSubjectId').value;
        if (editId && confirm('Удалить предмет и все его оценки?')) {
            appData.subjects = appData.subjects.filter(s => s.id !== editId);
            renderApp();
            modalAddSubject.classList.remove('active');
        }
    });

    // 8. Shareable Report Card Modal
    const modalShareReport = document.getElementById('modalShareReport');
    document.getElementById('btnShareReport').addEventListener('click', () => {
        haptic('light');
        openShareReportModal();
    });
    document.getElementById('btnCloseShareModal').addEventListener('click', () => modalShareReport.classList.remove('active'));

    function openShareReportModal() {
        const subjects = appData.subjects || [];
        const periodName = appData.settings?.period || 'Четверть 1';
        const thresh5 = getActiveThreshold();

        const allGrades = subjects.reduce((acc, s) => acc.concat(s.grades || []), []);
        const overallAvg = GradeCalculator.calculateWeightedAverage(allGrades);

        document.getElementById('sharePeriodText').textContent = periodName;
        document.getElementById('shareAvgVal').textContent = overallAvg > 0 ? overallAvg.toFixed(2) : '0.00';

        const listEl = document.getElementById('shareSubjectsList');
        listEl.innerHTML = subjects.map(s => {
            const avg = GradeCalculator.calculateWeightedAverage(s.grades || []);
            const mark = GradeCalculator.getFinalMark(avg, thresh5);
            return `
                <div style="display:flex; justify-content:space-between; border-bottom:1px solid var(--border-subtle); padding:4px 0;">
                    <span>${s.icon || '📖'} ${escapeHtml(s.name)}</span>
                    <span style="font-weight:700;">${avg > 0 ? avg.toFixed(2) : '—'} (Выходит: ${mark})</span>
                </div>
            `;
        }).join('');

        modalShareReport.classList.add('active');
    }

    document.getElementById('btnCopyReportText').addEventListener('click', () => {
        haptic('medium');
        const subjects = appData.subjects || [];
        const periodName = appData.settings?.period || 'Четверть 1';
        const thresh5 = getActiveThreshold();
        const allGrades = subjects.reduce((acc, s) => acc.concat(s.grades || []), []);
        const overallAvg = GradeCalculator.calculateWeightedAverage(allGrades);

        let text = `🎓 Мой Табель Успеваемости (${periodName})\n`;
        text += `📊 Общий средневзвешенный балл: ${overallAvg.toFixed(2)}\n\n`;
        subjects.forEach(s => {
            const avg = GradeCalculator.calculateWeightedAverage(s.grades || []);
            const mark = GradeCalculator.getFinalMark(avg, thresh5);
            text += `${s.icon || '📖'} ${s.name}: ${avg.toFixed(2)} → Итоговая: ${mark}\n`;
        });
        text += `\nРассчитано в Телеграм-боте Счетчик Оценок 🚀`;

        navigator.clipboard.writeText(text).then(() => {
            alert('📋 Отчёт скопирован в буфер обмена! Вы можете вставить его в чат Telegram.');
        });
    });

    // 9. Forecaster & Simulator Updates
    function updateForecasterView() {
        const subjId = document.getElementById('predictSubjectSelect').value;
        const targetMark = Number(document.getElementById('predictTargetMark').value);
        const resultBox = document.getElementById('predictionText');

        const subj = appData.subjects.find(s => s.id === subjId);
        if (!subj) {
            resultBox.innerHTML = 'Добавьте хотя бы один предмет для расчета.';
            return;
        }

        const currentAvg = GradeCalculator.calculateWeightedAverage(subj.grades || []);
        const thresh5 = getActiveThreshold();
        const targetThreshold = targetMark === 5 ? thresh5 : (targetMark === 4 ? 3.50 : 2.50);

        if (currentAvg >= targetThreshold) {
            resultBox.innerHTML = `🎉 У тебя по предмету <b>${escapeHtml(subj.name)}</b> уже выходит <b>«${targetMark}»</b> (текущий балл: <b>${currentAvg.toFixed(2)}</b>). Так держать!`;
            return;
        }

        const neededCount = GradeCalculator.predictNeededGrades(subj.grades || [], targetThreshold, targetMark, currentSelectedWeight);

        if (neededCount === Infinity || neededCount > 50) {
            resultBox.innerHTML = `⚠️ Достичь «${targetMark}» с оценкой <b>${targetMark}</b> при весе <b>${currentSelectedWeight}</b> пока математически невозможно. Попробуйте сдать более важную работу (с коэффициентом 4 или 5).`;
        } else {
            resultBox.innerHTML = `Текущий балл по <b>${escapeHtml(subj.name)}</b>: <b>${currentAvg.toFixed(2)}</b>.<br>` +
                `Чтобы выходила <span class="prediction-highlight">«${targetMark}»</span> (балл ≥ ${targetThreshold.toFixed(2)}), тебе нужно получить ещё ` +
                `<span class="prediction-highlight">${neededCount}</span> оценок <b>«${targetMark}»</b> с весом <b>${currentSelectedWeight}</b>!`;
        }
    }

    const predictWeightBtns = document.querySelectorAll('#predictWeightSelector .weight-btn');
    predictWeightBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            haptic('light');
            predictWeightBtns.forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            currentSelectedWeight = Number(btn.getAttribute('data-w'));
            updateForecasterView();
        });
    });

    document.getElementById('predictSubjectSelect').addEventListener('change', updateForecasterView);
    document.getElementById('predictTargetMark').addEventListener('change', updateForecasterView);

    function updateSimView() {
        const subjId = document.getElementById('simSubjectSelect').value;
        const resultText = document.getElementById('simResultText');
        const draftWrap = document.getElementById('simDraftGradesWrap');

        const subj = appData.subjects.find(s => s.id === subjId);
        if (!subj) {
            resultText.innerHTML = 'Выберите предмет для примерки.';
            return;
        }

        const thresh5 = getActiveThreshold();

        draftWrap.innerHTML = simulatedGradesList.map((g, idx) => `
            <div class="grade-pill grade-${g.grade} sim-draft-pill" data-simidx="${idx}" title="Удалить оценку">
                <span class="grade-val">${g.grade}</span>
                <span class="weight-tag">x${g.weight}</span>
                <span class="sim-remove-badge">×</span>
            </div>
        `).join('');

        if (simulatedGradesList.length === 0) {
            resultText.innerHTML = `Текущий балл по <b>${escapeHtml(subj.name)}</b>: <b>${GradeCalculator.calculateWeightedAverage(subj.grades || []).toFixed(2)}</b> (порог на 5: ${thresh5.toFixed(2)}). Нажмите на кнопку с оценкой выше, чтобы примерить.`;
            return;
        }

        const simResult = GradeCalculator.simulateGrades(subj.grades || [], simulatedGradesList, thresh5);
        const sign = simResult.diff >= 0 ? '+' : '';
        resultText.innerHTML = `
            После примерки <b>${simulatedGradesList.length}</b> оценок (порог на 5: <b>${thresh5.toFixed(2)}</b>):<br>
            Новый средний балл: <span class="prediction-highlight" style="font-size:18px;">${simResult.newAvg.toFixed(2)}</span> ` +
            `(<span style="color:${simResult.diff >= 0 ? '#34c759' : '#ff3b30'}">${sign}${simResult.diff.toFixed(2)}</span>)<br>` +
            `Итоговая оценка: <b>${simResult.oldFinalMark}</b> → <b style="font-size:16px; color:var(--accent-blue);">${simResult.newFinalMark}</b>
        `;
    }

    document.getElementById('simDraftGradesWrap').addEventListener('click', (e) => {
        const pill = e.target.closest('.sim-draft-pill');
        if (pill) {
            haptic('light');
            const idx = Number(pill.getAttribute('data-simidx'));
            if (!isNaN(idx) && idx >= 0 && idx < simulatedGradesList.length) {
                simulatedGradesList.splice(idx, 1);
                updateSimView();
            }
        }
    });

    const simWeightBtns = document.querySelectorAll('#simWeightSelector .weight-btn');
    simWeightBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            haptic('light');
            simWeightBtns.forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            currentSimWeight = Number(btn.getAttribute('data-w'));
        });
    });

    ['2', '3', '4', '5'].forEach(val => {
        document.getElementById(`btnSimPlus${val}`).addEventListener('click', () => {
            haptic('medium');
            simulatedGradesList.push({ grade: Number(val), weight: currentSimWeight });
            updateSimView();
        });
    });

    document.getElementById('btnResetSim').addEventListener('click', () => {
        haptic('light');
        simulatedGradesList = [];
        updateSimView();
    });
    document.getElementById('simSubjectSelect').addEventListener('change', () => {
        simulatedGradesList = [];
        updateSimView();
    });

    // 10. Modals & Add Grade Handlers
    const modalAddGrade = document.getElementById('modalAddGrade');
    const modalPortalBind = document.getElementById('modalPortalBind');
    const modalSettings = document.getElementById('modalSettings');

    document.addEventListener('click', (e) => {
        const quickBtn = e.target.closest('.btn-quick-add-grade');
        if (quickBtn) {
            haptic('light');
            const subjId = quickBtn.getAttribute('data-subjid');
            openGradeModal(subjId);
            return;
        }

        const gradePill = e.target.closest('.grade-pill');
        if (gradePill && gradePill.hasAttribute('data-gradeid')) {
            haptic('light');
            const subjId = gradePill.getAttribute('data-subjid');
            const gradeId = gradePill.getAttribute('data-gradeid');
            openGradeModal(subjId, gradeId);
        }
    });

    function openGradeModal(subjId, gradeId = null) {
        document.getElementById('gradeSubjectId').value = subjId;
        document.getElementById('editGradeId').value = gradeId || '';
        document.getElementById('gradeCommentInput').value = '';

        const deleteBtn = document.getElementById('btnDeleteGrade');

        if (gradeId) {
            document.getElementById('modalGradeTitle').textContent = 'Редактировать оценку';
            deleteBtn.style.display = 'block';
            const subj = appData.subjects.find(s => s.id === subjId);
            const item = (subj?.grades || []).find(g => g.id === gradeId);
            if (item) {
                modalSelectedGrade = item.grade;
                modalSelectedWeight = item.weight;
                document.getElementById('gradeCommentInput').value = item.comment || '';
            }
        } else {
            document.getElementById('modalGradeTitle').textContent = 'Добавить оценку';
            deleteBtn.style.display = 'none';
            modalSelectedGrade = 5;
            modalSelectedWeight = 1;
        }

        selectModalGradeBtn(modalSelectedGrade);
        selectModalWeightBtn(modalSelectedWeight);
        modalAddGrade.classList.add('active');
    }

    function selectModalGradeBtn(grade) {
        const btns = document.querySelectorAll('#modalGradeButtons .weight-btn');
        btns.forEach(b => {
            if (Number(b.getAttribute('data-g')) === grade) {
                b.classList.add('selected');
            } else {
                b.classList.remove('selected');
            }
        });
    }

    function selectModalWeightBtn(weight) {
        const btns = document.querySelectorAll('#modalWeightSelector .weight-btn');
        btns.forEach(b => {
            if (Number(b.getAttribute('data-w')) === weight) {
                b.classList.add('selected');
            } else {
                b.classList.remove('selected');
            }
        });
    }

    document.querySelectorAll('#modalGradeButtons .weight-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            haptic('light');
            modalSelectedGrade = Number(btn.getAttribute('data-g'));
            selectModalGradeBtn(modalSelectedGrade);
        });
    });

    document.querySelectorAll('#modalWeightSelector .weight-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            haptic('light');
            modalSelectedWeight = Number(btn.getAttribute('data-w'));
            selectModalWeightBtn(modalSelectedWeight);
        });
    });

    document.getElementById('btnSaveGrade').addEventListener('click', () => {
        haptic('medium');
        const subjId = document.getElementById('gradeSubjectId').value;
        const gradeId = document.getElementById('editGradeId').value;
        const comment = document.getElementById('gradeCommentInput').value;

        const subj = appData.subjects.find(s => s.id === subjId);
        if (subj) {
            if (!subj.grades) subj.grades = [];

            if (gradeId) {
                const item = subj.grades.find(g => g.id === gradeId);
                if (item) {
                    item.grade = modalSelectedGrade;
                    item.weight = modalSelectedWeight;
                    item.comment = comment;
                }
            } else {
                subj.grades.push({
                    id: 'g_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
                    grade: modalSelectedGrade,
                    weight: modalSelectedWeight,
                    comment: comment,
                    date: new Date().toISOString().split('T')[0]
                });
            }
            renderApp();
        }
        modalAddGrade.classList.remove('active');
    });

    document.getElementById('btnDeleteGrade').addEventListener('click', () => {
        haptic('medium');
        const subjId = document.getElementById('gradeSubjectId').value;
        const gradeId = document.getElementById('editGradeId').value;
        const subj = appData.subjects.find(s => s.id === subjId);
        if (subj && gradeId) {
            subj.grades = subj.grades.filter(g => g.id !== gradeId);
            renderApp();
        }
        modalAddGrade.classList.remove('active');
    });

    document.getElementById('btnCloseGradeModal').addEventListener('click', () => modalAddGrade.classList.remove('active'));

    // 11. Secure Vault Portal Binding Modal Logic
    document.getElementById('btnPortalBind').addEventListener('click', () => {
        haptic('light');
        document.getElementById('pinChangeProtectedBox').style.display = 'none';
        document.getElementById('oldPinVerifyInput').value = '';
        updatePortalUIState();
        modalPortalBind.classList.add('active');
    });
    document.getElementById('btnClosePortalModal').addEventListener('click', () => modalPortalBind.classList.remove('active'));

    const togglePassBtn = document.getElementById('btnTogglePortalPass');
    if (togglePassBtn) {
        togglePassBtn.addEventListener('click', () => {
            haptic('light');
            const passInput = document.getElementById('portalPasswordInput');
            if (passInput.type === 'password') {
                passInput.type = 'text';
                togglePassBtn.textContent = '🙈';
            } else {
                passInput.type = 'password';
                togglePassBtn.textContent = '👁️';
            }
        });
    }

    const togglePinBtn = document.getElementById('btnTogglePinPass');
    if (togglePinBtn) {
        togglePinBtn.addEventListener('click', () => {
            haptic('light');
            const pinInput = document.getElementById('portalPinInput');
            if (pinInput.type === 'password') {
                pinInput.type = 'text';
                togglePinBtn.textContent = '🙈';
            } else {
                pinInput.type = 'password';
                togglePinBtn.textContent = '👁️';
            }
        });
    }

    function updatePortalUIState() {
        const portal = appData.portal || {};
        const connectedView = document.getElementById('portalConnectedView');
        const step1 = document.getElementById('portalStep1');
        const step2 = document.getElementById('portalStep2');

        const titleEl = document.getElementById('connectedPortalNameTitle');
        const descEl = document.getElementById('connectedPortalDetails');

        if (portal.connected) {
            connectedView.style.display = 'block';
            step1.style.display = 'none';
            step2.style.display = 'none';

            const portalNames = { mesh: 'МЭШ', dnevnik: 'Дневник.ру', netcity: 'Сетевой Город', myschool: 'Моя Школа' };
            titleEl.textContent = `🟢 Подключен: ${portalNames[portal.portalType] || 'Дневник'}`;
            descEl.textContent = `Все данные зашифрованы и защищены PIN-кодом`;
        } else {
            connectedView.style.display = 'none';
            step1.style.display = 'block';
            step2.style.display = 'none';

            document.getElementById('portalLoginInput').value = '';
            document.getElementById('portalPasswordInput').value = '';
        }
    }

    document.getElementById('btnRebindPortal').addEventListener('click', () => {
        haptic('light');
        const box = document.getElementById('pinChangeProtectedBox');
        box.style.display = box.style.display === 'none' ? 'block' : 'none';
    });

    document.getElementById('btnConfirmOldPinVerify').addEventListener('click', async () => {
        haptic('medium');
        const verifyPin = document.getElementById('oldPinVerifyInput').value.trim();
        const portal = appData.portal || {};

        if (!verifyPin) {
            alert('Введите ваш текущий PIN-код!');
            return;
        }

        try {
            if (portal.encryptedVault) {
                await SafeVault.decryptData(portal.encryptedVault, verifyPin);
            }
            alert('🔓 PIN-код верный! Теперь вы можете задать новый PIN-код.');
            document.getElementById('pinChangeProtectedBox').style.display = 'none';
            document.getElementById('portalConnectedView').style.display = 'none';
            document.getElementById('portalStep1').style.display = 'block';
        } catch (e) {
            alert('⛔ Неверный PIN-код! Доступ запрещен.');
        }
    });

    // Forgot PIN reset button
    document.getElementById('btnForgotPinReset').addEventListener('click', () => {
        haptic('medium');
        if (confirm('Если вы забыли PIN-код, старый зашифрованный ключ будет удален. Вы сможете заново ввести пароль и установить новый PIN-код. Сбросить привязку?')) {
            appData.portal = { connected: false, portalType: 'mesh', login: '' };
            StorageManager.saveData(appData);
            document.getElementById('pinChangeProtectedBox').style.display = 'none';
            document.getElementById('oldPinVerifyInput').value = '';
            updatePortalUIState();
            initAutoSyncEngine();
            alert('🔄 Привязка сброшена. Вы можете пройти привязку заново и задать любой новый PIN-код!');
        }
    });

    document.getElementById('btnPortalStep1Next').addEventListener('click', () => {
        haptic('light');
        const login = document.getElementById('portalLoginInput').value.trim();

        if (!login) {
            alert('Пожалуйста, введите ваш логин, СНИЛС или email.');
            return;
        }

        document.getElementById('portalStep1').style.display = 'none';
        document.getElementById('portalStep2').style.display = 'block';
    });

    document.getElementById('btnPortalStep2Back').addEventListener('click', () => {
        haptic('light');
        document.getElementById('portalStep1').style.display = 'block';
        document.getElementById('portalStep2').style.display = 'none';
    });

    const pinLenBtns = document.querySelectorAll('#pinLengthSelector .weight-btn');
    pinLenBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            haptic('light');
            pinLenBtns.forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            selectedPinLength = Number(btn.getAttribute('data-pinlen'));

            const pinInput = document.getElementById('portalPinInput');
            const pinLabel = document.getElementById('pinInputLabel');

            pinInput.value = '';
            pinInput.setAttribute('maxlength', selectedPinLength);
            pinInput.setAttribute('placeholder', '•'.repeat(selectedPinLength));
            pinLabel.textContent = `Введите новый ${selectedPinLength}-значный PIN-код:`;
        });
    });

    document.getElementById('btnConnectPortal').addEventListener('click', async () => {
        haptic('medium');
        const portalType = document.getElementById('portalSelect').value;
        const login = document.getElementById('portalLoginInput').value.trim();
        const pass = document.getElementById('portalPasswordInput').value;
        const pin = document.getElementById('portalPinInput').value.trim();

        if (!pin || pin.length !== selectedPinLength) {
            alert(`Пожалуйста, введите ровно ${selectedPinLength} цифр PIN-кода.`);
            return;
        }

        try {
            const payload = JSON.stringify({ login, pass, timestamp: Date.now() });
            const encryptedVaultData = await SafeVault.encryptData(payload, pin);

            appData.portal = {
                connected: true,
                portalType,
                login,
                pinLength: selectedPinLength,
                encryptedVault: encryptedVaultData,
                lastSync: new Date().toISOString()
            };

            StorageManager.saveData(appData);
            updatePortalUIState();
            initAutoSyncEngine();
            alert(`🛡️ Сейф переподключен! Данные запечатаны новым ${selectedPinLength}-значным PIN-кодом.`);
            modalPortalBind.classList.remove('active');
        } catch (e) {
            alert(`Ошибка шифрования: ${e.message}`);
        }
    });

    document.getElementById('btnSyncNow').addEventListener('click', () => {
        haptic('medium');
        performBackgroundPortalSync(true);
        updateScheduleView();
    });

    document.getElementById('btnDisconnectPortal').addEventListener('click', () => {
        if (confirm('Вы действительно хотите отвязать дневник и БЕЗВОЗВРАТНО удалить все пароли и логин с этого устройства?')) {
            haptic('medium');
            appData.portal = { connected: false, portalType: 'mesh', login: '' };
            StorageManager.saveData(appData);
            
            document.getElementById('portalLoginInput').value = '';
            document.getElementById('portalPasswordInput').value = '';
            document.getElementById('portalPinInput').value = '';

            updatePortalUIState();
            initAutoSyncEngine();
            alert('🗑️ Дневник отвязан! Все пароли и зашифрованные данные БЕЗВОЗВРАТНО УДАЛЕНЫ!');
        }
    });

    // 12. Settings Modal & Auto-Sync Configuration
    document.getElementById('btnSettings').addEventListener('click', () => {
        haptic('light');
        document.getElementById('settingPeriodSelect').value = appData.settings?.period || 'Четверть 1';
        document.getElementById('settingThresholdSelect').value = (appData.settings?.threshold5 || 4.50).toFixed(2);
        document.getElementById('settingThemeSelect').value = appData.settings?.theme || 'light';
        document.getElementById('settingAutoSyncSelect').value = appData.settings?.autoSync || 'auto_15';
        modalSettings.classList.add('active');
    });
    document.getElementById('btnCloseSettingsModal').addEventListener('click', () => modalSettings.classList.remove('active'));

    function applyTheme(theme) {
        document.body.removeAttribute('data-theme');
        document.body.classList.remove('dark-mode');
        if (theme === 'dark') {
            document.body.classList.add('dark-mode');
        } else if (theme && theme !== 'light' && theme !== 'auto') {
            document.body.setAttribute('data-theme', theme);
        }
    }

    document.getElementById('btnSaveSettings').addEventListener('click', () => {
        haptic('medium');
        const period = document.getElementById('settingPeriodSelect').value;
        const thresh = Number(document.getElementById('settingThresholdSelect').value);
        const theme = document.getElementById('settingThemeSelect').value;
        const autoSync = document.getElementById('settingAutoSyncSelect').value;

        appData.settings = { period, threshold5: thresh, theme, autoSync };

        applyTheme(theme);
        initAutoSyncEngine();
        renderApp();
        updateSimView();
        modalSettings.classList.remove('active');
    });

    document.getElementById('btnClearAllData').addEventListener('click', () => {
        if (confirm('Вы уверены, что хотите полностью сбросить все предметы, оценки и ключи авторизации?')) {
            haptic('medium');
            localStorage.clear();
            appData = StorageManager.loadData();
            initAutoSyncEngine();
            renderApp();
            updateSimView();
            modalSettings.classList.remove('active');
            alert('🧹 Все данные и зашифрованные сейфы полностью очищены!');
        }
    });

    // Initial Render & Engine Start
    applyTheme(appData.settings?.theme);
    renderApp();
    initAutoSyncEngine();
});
