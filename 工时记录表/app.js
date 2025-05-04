(function() {
    // 常量定义
    const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    const MONTH_NAMES = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];
    
    // 加班费率（使用let以便动态更新）
    let OVERTIME_RATES = {
        A: 39.65517, // 工作日加班 1.5倍
        B: 52.87356, // 周末/调休工作日加班 2倍
        C: 79.31035  // 节假日加班 3倍
    };

    
    // 状态管理
    const state = {
        currentDate: new Date(),
        holidays: [],
        workdays: [],
        specialWorkdays: [],
        hoursData: {},
        selectedDate: null,
        darkMode: false,
        baseSalary: 4600,
        recordsViewMode: 'current',
        recordsViewYear: new Date().getFullYear(),
        recordsViewMonth: new Date().getMonth() + 1,
        domCache: {}
    };
    
    // DOM元素缓存
    function cacheDOM() {
        const elements = {
            'calendarDays': 'calendar-days',
            'yearSelector': 'year-selector',
            'monthSelector': 'month-selector',
            'yearSelect': 'year-select',
            'monthSelect': 'month-select',
            'dayDetails': 'day-details',
            'detailDate': 'detail-date',
            'hoursInput': 'hours-input',
            'hoursType': 'hours-type',
            'hoursBody': 'hours-body',
            'themeToggle': 'theme-toggle',
            'monthlyOvertime': 'monthly-overtime',
            'monthlyLeave': 'monthly-leave',
            'monthlyOvertimePay': 'monthly-overtime-pay',
            'estimatedSalary': 'estimated-salary',
            'hoursMessage': 'hours-message',
            'baseSalaryInput': 'base-salary',
            'dailySalary': 'daily-salary',
            'hourlySalary': 'hourly-salary',
            // 'fileInput': 'file-input',
            'saveHours': 'save-hours',
            'clearHours': 'clear-hours',
            'clearAllData': 'clear-all-data',
            'prevMonthRecords': 'prev-month-records',
            'nextMonthRecords': 'next-month-records',
            'currentMonthRecords': 'current-month-records',
            'allRecords': 'all-records',
            'goToDate': 'go-to-date',
            'saveSalary': 'save-salary'
        };
        
        Object.keys(elements).forEach(key => {
            state.domCache[key] = document.getElementById(elements[key]);
        });
    }
    
    // 确保初始化时渲染日历
    function init() {
        cacheDOM();
        loadFromLocalStorage();
        fetchHolidays();
        initDateSelectors();
        initRecordsSelectors();
        setupEventListeners();
        renderCalendar(); // 确保日历渲染
        updateRecordsView();
        updateStatistics();
        // 更新今天标记
        updateTodayMarker();
    }
    
    function updateTodayMarker() {
        const todayMarker = document.querySelector('.today-marker');
        if (todayMarker) {
            const today = new Date();
            todayMarker.textContent = today.getDate();
        }
    }

    // 从本地存储加载数据
    function loadFromLocalStorage() {
        // 加载工作数据
        const hoursData = localStorage.getItem('hoursData');
        if (hoursData) {
            try {
                state.hoursData = JSON.parse(hoursData);
            } catch (e) {
                console.error('解析工作数据失败:', e);
                state.hoursData = {};
            }
        }
        
        // 加载主题设置
        const theme = localStorage.getItem('theme');
        state.darkMode = theme === 'dark';
        applyTheme();
        
        // 加载工资配置
        const savedSalary = localStorage.getItem('baseSalary');
        if (savedSalary) {
            state.baseSalary = parseFloat(savedSalary) || 4600;
            state.domCache.baseSalaryInput.value = state.baseSalary;
        }
        updateSalaryConfig();
    }
    
    // 获取节假日信息
    function fetchHolidays() {
        // 2025年法定节假日
        state.holidays = [
            '2025-01-01', // 元旦
            '2025-01-28', '2025-01-29', '2025-01-30', '2025-01-31',  // 春节
            '2025-04-04',  // 清明节
            '2025-05-01', '2025-05-02', '2025-05-31',  // 劳动节
            '2025-10-01', '2025-10-02', '2025-10-03', '2025-10-04', '2025-10-05', '2025-10-06' // 国庆节
        ];
        
        // 2025年调休工作日
        state.workdays = [
            '2025-01-26', '2025-02-08',
            '2025-04-27', 
            '2025-09-28', '2025-10-11' 
        ];
        
        // 2025年放假调休日(双倍加班费)
        state.specialWorkdays = [
            '2025-02-03', '2025-02-04', '2025-05-05', '2025-06-02', '2025-09-28', '2025-10-11'
        ];
    }
    
    // 设置事件监听器
    function setupEventListeners() {
        // 月份导航
        document.getElementById('prev-month').addEventListener('click', () => changeMonth(-1));
        document.getElementById('next-month').addEventListener('click', () => changeMonth(1));
        
        // 记录视图导航
        document.getElementById('prev-month-records').addEventListener('click', () => changeRecordsMonth(-1));
        document.getElementById('next-month-records').addEventListener('click', () => changeRecordsMonth(1));
        document.getElementById('current-month-records').addEventListener('click', showCurrentMonthRecords);
        document.getElementById('all-records').addEventListener('click', showAllRecords);
        document.getElementById('go-to-date').addEventListener('click', goToSelectedDate);
        
        // 日期选择器
        state.domCache.yearSelector.addEventListener('change', handleDateSelection);
        state.domCache.monthSelector.addEventListener('change', handleDateSelection);
        
        // 工作记录操作
        state.domCache.saveHours.addEventListener('click', saveHours);
        state.domCache.clearHours.addEventListener('click', clearHours);
        
        // 数据导入导出
        document.getElementById('export-excel').addEventListener('click', exportToExcel);
        document.getElementById('import-data').addEventListener('click', showImportDialog);

        // 添加拖放支持
        document.addEventListener('dragover', handleDragOver);
        document.addEventListener('dragleave', handleDragLeave);
        document.addEventListener('drop', handleDrop);
        
        // 拖放相关函数
        function handleDragOver(e) {
            e.preventDefault();
            e.stopPropagation();
            document.body.classList.add('dragover');
        }

        function handleDragLeave(e) {
            e.preventDefault();
            e.stopPropagation();
            document.body.classList.remove('dragover');
        }

        function handleDrop(e) {
            e.preventDefault();
            e.stopPropagation();
            document.body.classList.remove('dragover');
            
            const files = e.dataTransfer.files;
            if (files.length && /\.(xlsx|xls)$/i.test(files[0].name)) {
                importExcelFile(files[0]);
            } else {
                showMessage('请拖放Excel文件(.xlsx或.xls)', 'text-danger');
            }
        }

        function showImportDialog() {
            showMessage('请将Excel文件拖放到页面中', 'text-info');
        }

        async function importExcelFile(file) {
            try {
                const data = await file.arrayBuffer();
                const wb = XLSX.read(data);
                const ws = wb.Sheets[wb.SheetNames[0]];
                const jsonData = XLSX.utils.sheet_to_json(ws);
                
                let newData = {};
                
                jsonData.forEach(row => {
                    if (row['日期'] && (row['工作时数'] || row['类型'])) {
                        const dateMatch = row['日期'].match(/(\d+)年(\d+)月(\d+)日/);
                        if (dateMatch) {
                            const year = parseInt(dateMatch[1]);
                            const month = parseInt(dateMatch[2]) - 1;
                            const day = parseInt(dateMatch[3]);
                            const date = new Date(year, month, day);
                            const dateStr = formatDate(date);
                            
                            const hours = parseFloat(row['工作时数']) || 0;
                            let type = 'A';
                            
                            if (row['类型']) {
                                if (row['类型'].includes('3倍') || row['类型'].includes('节假日')) {
                                    type = 'C';
                                } else if (row['类型'].includes('2倍') || row['类型'].includes('周末') || row['类型'].includes('调休日')) {
                                    type = 'B';
                                }
                            }
                            
                            if (hours !== 0) {
                                newData[dateStr] = {
                                    date: dateStr,
                                    hours: hours,
                                    type: hours > 0 ? type : null,
                                    timestamp: new Date().toISOString()
                                };
                            }
                        }
                    }
                });
                
                state.hoursData = { ...state.hoursData, ...newData };
                saveToLocalStorage();
                render();
                showMessage('Excel数据导入成功', 'text-success');
            } catch (error) {
                console.error('导入失败:', error);
                showMessage(`导入失败: ${error.message}`, 'text-danger');
            }
        }

        // 主题切换
        state.domCache.themeToggle.addEventListener('click', toggleTheme);
        
        // 工资配置
        state.domCache.baseSalaryInput.addEventListener('change', updateSalaryConfig);
        
        // 其他操作
        document.getElementById('clear-all-data').addEventListener('click', clearAllData);
        
        // 自动保存
        // state.domCache.hoursInput.addEventListener('blur', autoSaveHours);

        state.domCache.saveSalary.addEventListener('click', updateSalaryConfig);
        
        // 使用事件委托处理日历点击
        state.domCache.calendarDays.addEventListener('click', handleCalendarDayClick);
    }
    
    // 渲染整个应用
    function render() {
        renderCalendar();
        updateRecordsView();
        updateStatistics();
    }
    
    // 渲染日历
    function renderCalendar() {
        updateDateSelectors();
        
        const firstDay = new Date(state.currentDate.getFullYear(), state.currentDate.getMonth(), 1);
        const lastDay = new Date(state.currentDate.getFullYear(), state.currentDate.getMonth() + 1, 0);
        const firstDayOfWeek = firstDay.getDay();
        const prevMonthLastDay = new Date(state.currentDate.getFullYear(), state.currentDate.getMonth(), 0).getDate();
        const today = new Date();
        const isCurrentMonth = today.getFullYear() === state.currentDate.getFullYear() && 
                              today.getMonth() === state.currentDate.getMonth();
        
        let calendarHTML = '';
        
        // 填充上个月的几天
        for (let i = firstDayOfWeek - 1; i >= 0; i--) {
            const day = prevMonthLastDay - i;
            const date = new Date(state.currentDate.getFullYear(), state.currentDate.getMonth() - 1, day);
            calendarHTML += createDayHTML(date, true);
        }
        
        // 填充当月的所有天
        for (let day = 1; day <= lastDay.getDate(); day++) {
            const date = new Date(state.currentDate.getFullYear(), state.currentDate.getMonth(), day);
            const isToday = isCurrentMonth && day === today.getDate();
            calendarHTML += createDayHTML(date, false, isToday);
        }
        
        // 填充下个月的前几天
        const daysRemaining = 42 - (firstDayOfWeek + lastDay.getDate());
        for (let day = 1; day <= daysRemaining; day++) {
            const date = new Date(state.currentDate.getFullYear(), state.currentDate.getMonth() + 1, day);
            calendarHTML += createDayHTML(date, true);
        }
        
        state.domCache.calendarDays.innerHTML = calendarHTML;
        
        // 如果有选中的日期，保持选中状态
        if (state.selectedDate) {
            highlightSelectedDay();
        }
    }
    
    // 创建日期元素的HTML
    function createDayHTML(date, isOtherMonth, isToday = false) {
        const dateStr = formatDate(date);
        const day = date.getDate();
        const dayOfWeek = date.getDay();
        
        let className = 'calendar-day';
        if (isOtherMonth) className += ' other-month';
        if (isToday) className += ' today';
        
        // 确定日期类型
        const isHoliday = state.holidays.includes(dateStr);
        const isWorkday = state.workdays.includes(dateStr);
        const isSpecialWorkday = state.specialWorkdays.includes(dateStr);
        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
        
        if (isHoliday) {
            className += ' holiday';
        } else if (isWeekend && !isWorkday && !isSpecialWorkday) {
            className += ' weekend';
        } else if (isWorkday || isSpecialWorkday) {
            className += ' workday';
        }
        
        // 添加工作信息
        let hoursDisplay = '';
        if (state.hoursData[dateStr]) {
            const hours = state.hoursData[dateStr].hours;
            if (hours < 0) {
                className += ' leave-day';
                hoursDisplay = `<div class="leave-display">${hours}h</div>`;
            } else if (hours > 0) {
                const type = state.hoursData[dateStr].type || 'A';
                hoursDisplay = `<div class="overtime-display">${type}-${hours}h</div>`;
            }
        }
        
        // 如果是选中的日期，添加选中类
        if (state.selectedDate && formatDate(state.selectedDate) === dateStr) {
            className += ' selected-day';
        }
        
        return `
            <div class="${className}" data-date="${dateStr}">
                <div class="day-number">${day}</div>
                ${hoursDisplay}
            </div>
        `;
    }
    
    // 处理日历日期点击
    function handleCalendarDayClick(event) {
        const dayElement = event.target.closest('.calendar-day');
        if (!dayElement) return;
        
        const dateStr = dayElement.dataset.date;
        const [year, month, day] = dateStr.split('-').map(Number);
        const date = new Date(year, month - 1, day);
        
        showDayDetails(date);
    }
    
    // 显示日期详情
    function showDayDetails(date) {
        state.selectedDate = date;
        const dateStr = formatDate(date);
        const dayOfWeek = date.getDay();
        
        // 更新日期标题
        state.domCache.detailDate.textContent = 
            `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日 ${WEEKDAYS[dayOfWeek]}`;
        
        // 确定工作类型
        const isHoliday = state.holidays.includes(dateStr);
        const isWorkday = state.workdays.includes(dateStr);
        const isSpecialWorkday = state.specialWorkdays.includes(dateStr);
        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
        
        let typeText = '工作日加班 (1.5倍)';
        
        if (isHoliday) {
            typeText = '节假日加班 (3倍)';
        } else if ((isWeekend && !isWorkday) || isSpecialWorkday) {
            typeText = isSpecialWorkday ? '放假调休日加班 (2倍)' : '周末加班 (2倍)';
        } else if (isWorkday) {
            typeText = '调休工作日加班 (1.5倍)';
        }
        
        state.domCache.hoursType.textContent = typeText;
        
        // 设置工作时数
        state.domCache.hoursInput.value = state.hoursData[dateStr] ? state.hoursData[dateStr].hours : '';
        
        // 清除消息
        showMessage('', '');
        
        // 显示详情面板
        state.domCache.dayDetails.classList.remove('hidden');
        
        // 高亮选中的日期
        highlightSelectedDay();
    }
    
    // 高亮选中的日期
    function highlightSelectedDay() {
        if (!state.selectedDate) return;
        
        // 移除之前的高亮
        document.querySelectorAll('.calendar-day.selected-day').forEach(el => {
            el.classList.remove('selected-day');
        });
        
        // 添加新的高亮
        const dateStr = formatDate(state.selectedDate);
        const dayElement = document.querySelector(`.calendar-day[data-date="${dateStr}"]`);
        if (dayElement) {
            dayElement.classList.add('selected-day');
        }
    }
    
    // 保存工作信息
    function saveHours() {
        if (!state.selectedDate) return;
        
        const dateStr = formatDate(state.selectedDate);
        const hoursInput = state.domCache.hoursInput.value.trim();
        
        if (!hoursInput) {
            showMessage('请输入工作时数', 'text-danger');
            return;
        }
        
        const hours = parseFloat(hoursInput);
        if (isNaN(hours)) {
            showMessage('请输入有效的工作时数', 'text-danger');
            return;
        }
        
        // 确定工作类型
        const isHoliday = state.holidays.includes(dateStr);
        const isWorkday = state.workdays.includes(dateStr);
        const isSpecialWorkday = state.specialWorkdays.includes(dateStr);
        const isWeekend = state.selectedDate.getDay() === 0 || state.selectedDate.getDay() === 6;
        
        let type = 'A';
        
        if (isHoliday) {
            type = 'C';
        } else if ((isWeekend && !isWorkday) || isSpecialWorkday) {
            type = 'B';
        }
        
        state.hoursData[dateStr] = {
            date: dateStr,
            hours: hours,
            type: hours >= 0 ? type : null,
            timestamp: new Date().toISOString()
        };
        
        saveToLocalStorage();
        render();
        showMessage('工作信息已保存', 'text-success');
    }
    
    // 自动保存工作信息
    function autoSaveHours() {
        if (!state.selectedDate || !state.domCache.hoursInput.value.trim()) return;
        saveHours();
    }
    
    // 清除工作信息
    function clearHours() {
        if (!state.selectedDate) return;
        
        const dateStr = formatDate(state.selectedDate);
        if (state.hoursData[dateStr]) {
            delete state.hoursData[dateStr];
            saveToLocalStorage();
            render();
            state.domCache.hoursInput.value = '';
            showMessage('工作信息已清除', 'text-success');
        }
    }
    
    // 更新工作记录视图
    function updateRecordsView() {
        const sortedDates = Object.keys(state.hoursData).sort((a, b) => new Date(a) - new Date(b));
        
        let tableHTML = '';
        
        if (sortedDates.length === 0) {
            tableHTML = '<tr><td colspan="6" class="text-center">暂无工作记录</td></tr>';
        } else {
            sortedDates.forEach(dateStr => {
                const date = new Date(dateStr);
                
                // 根据视图模式过滤记录
                if (state.recordsViewMode === 'current') {
                    if (date.getFullYear() !== state.currentDate.getFullYear() || 
                        date.getMonth() !== state.currentDate.getMonth()) {
                        return;
                    }
                } else if (state.recordsViewMode === 'specific') {
                    if (date.getFullYear() !== state.recordsViewYear || 
                        date.getMonth() + 1 !== state.recordsViewMonth) {
                        return;
                    }
                }
                
                const dayOfWeek = date.getDay();
                const hours = parseFloat(state.hoursData[dateStr].hours) || 0;
                const type = state.hoursData[dateStr].type || 'A';
                
                // 计算金额和类型
                let amount = 0;
                let rateText = '';
                let typeText = '';
                if (hours > 0) {
                    // 加班计算
                    const rate = OVERTIME_RATES[type];
                    amount = hours * rate;
                    rateText = `${rate.toFixed(2)}元/时`;
                    
                    switch (type) {
                        case 'A':
                            typeText = '工作日加班';
                            break;
                        case 'B':
                            typeText = state.specialWorkdays.includes(dateStr) ? '调休日加班' : '周末加班';
                            break;
                        case 'C':
                            typeText = '节假日加班';
                            break;
                    }
                } else if (hours < 0) {
                    // 请假扣款
                    const hourlyRate = OVERTIME_RATES['A'];
                    amount = hours * hourlyRate;
                    rateText = `${hourlyRate.toFixed(2)}元/时 (1.5倍)`;
                    typeText = '请假/调休';
                }
                
                tableHTML += `
                    <tr>
                        <td>${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日</td>
                        <td>${WEEKDAYS[dayOfWeek]}</td>
                        <td>${typeText}</td>
                        <td>${hours}小时</td>
                        <td>${rateText}</td>
                        <td>${amount.toFixed(2)}元</td>
                    </tr>
                `;
            });
            
            if (!tableHTML) {
                tableHTML = '<tr><td colspan="6" class="text-center">当前筛选条件下无记录</td></tr>';
            }
        }
        
        state.domCache.hoursBody.innerHTML = tableHTML;
    }
    
    // 更新统计信息
    function updateStatistics() {
        const monthStart = new Date(state.currentDate.getFullYear(), state.currentDate.getMonth(), 1);
        const monthEnd = new Date(state.currentDate.getFullYear(), state.currentDate.getMonth() + 1, 0);
        
        let monthlyOvertime = 0;
        let monthlyOvertimePay = 0;
        let monthlyLeave = 0;
        let monthlyLeaveDeduction = 0;
        
        for (let d = new Date(monthStart); d <= monthEnd; d.setDate(d.getDate() + 1)) {
            const dayStr = formatDate(d);
            if (state.hoursData[dayStr]) {
                const hours = parseFloat(state.hoursData[dayStr].hours) || 0;
                const type = state.hoursData[dayStr].type || 'A';
                
                if (hours > 0) {
                    monthlyOvertime += hours;
                    monthlyOvertimePay += hours * OVERTIME_RATES[type];
                } else if (hours < 0) {
                    monthlyLeave += Math.abs(hours);
                    monthlyLeaveDeduction += Math.abs(hours) * OVERTIME_RATES['A'];
                }
            }
        }
        
        // 计算请假天数 (8小时为1天)
        const leaveDays = monthlyLeave / 8;
        
        // 更新UI
        state.domCache.monthlyOvertime.textContent = `${monthlyOvertime.toFixed(1)}小时`;
        state.domCache.monthlyLeave.textContent = `${monthlyLeave.toFixed(1)}小时 (${leaveDays.toFixed(1)}天)`;
        state.domCache.monthlyOvertimePay.textContent = `${monthlyOvertimePay.toFixed(2)}元`;
        
        // 计算预计实发工资
        const estimatedSalary = state.baseSalary + monthlyOvertimePay - monthlyLeaveDeduction;
        state.domCache.estimatedSalary.textContent = `${estimatedSalary.toFixed(2)}元`;
        
        // 检查加班限制
        if (monthlyOvertime > 160) {
            state.domCache.monthlyOvertime.classList.add('stats-warning');
            state.domCache.monthlyOvertime.classList.remove('stats-ok');
        } else {
            state.domCache.monthlyOvertime.classList.add('stats-ok');
            state.domCache.monthlyOvertime.classList.remove('stats-warning');
        }
    }
    
    // 更新工资配置
    function updateSalaryConfig() {
        const newSalary = parseFloat(state.domCache.baseSalaryInput.value);
        if (isNaN(newSalary)) {
            showMessage('请输入有效的标准工资', 'text-danger');
            return;
        }
    
    // 动态更新图例中的费率显示
    document.querySelectorAll('.rate-value').forEach(el => {
        const rateType = el.dataset.rate;
        if(rateType && OVERTIME_RATES[rateType]) {
            el.textContent = OVERTIME_RATES[rateType].toFixed(2);
        }
    });

        state.baseSalary = newSalary;
        
        // 计算基础时薪（1.5倍）
        const dailySalary = state.baseSalary / 21.75;
        const baseHourlySalary = dailySalary / 8;
        
        // 更新加班费率
        OVERTIME_RATES.A = baseHourlySalary * 1.5;  // 工作日加班1.5倍
        OVERTIME_RATES.B = baseHourlySalary * 2;    // 周末加班2倍
        OVERTIME_RATES.C = baseHourlySalary * 3;    // 节假日加班3倍
        
        // 更新UI显示
        state.domCache.dailySalary.textContent = dailySalary.toFixed(2);
        state.domCache.hourlySalary.textContent = baseHourlySalary.toFixed(2);
        
        // 保存到本地存储
        localStorage.setItem('baseSalary', state.baseSalary.toString());
        
        // 更新统计信息
        updateStatistics();
        updateRecordsView();
        
        showMessage('工资设置已保存', 'text-success');
    }
    
    // 导出为Excel
    function exportToExcel() {
        if (Object.keys(state.hoursData).length === 0) {
            showMessage('没有工作记录可导出', 'text-danger');
            return;
        }
        
        // 准备数据
        const data = [
            ['日期', '星期', '类型', '工作时数', '费率', '金额', '备注']
        ];
        
        // 按日期排序
        const sortedDates = Object.keys(state.hoursData).sort((a, b) => new Date(a) - new Date(b));
        
        sortedDates.forEach(dateStr => {
            const date = new Date(dateStr);
            const dayOfWeek = date.getDay();
            
            const hours = parseFloat(state.hoursData[dateStr].hours) || 0;
            const type = state.hoursData[dateStr].type || 'A';
            
            // 计算金额
            let amount = 0;
            let rateText = '';
            let typeText = '';
            let note = '';
            
            if (hours > 0) {
                const rate = OVERTIME_RATES[type];
                amount = hours * rate;
                rateText = `${rate.toFixed(2)}元/时`;
                
                switch (type) {
                    case 'A':
                        typeText = '工作日加班';
                        break;
                    case 'B':
                        typeText = state.specialWorkdays.includes(dateStr) ? '放假调休日加班' : '周末加班';
                        note = state.specialWorkdays.includes(dateStr) ? '放假调休日' : '';
                        break;
                    case 'C':
                        typeText = '节假日加班';
                        break;
                }
            } else if (hours < 0) {
                const hourlyRate = OVERTIME_RATES['A'];
                amount = hours * hourlyRate;
                rateText = `${hourlyRate.toFixed(2)}元/时 (1.5倍)`;
                typeText = '请假/调休';
            }
            
            data.push([
                `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`,
                WEEKDAYS[dayOfWeek],
                typeText,
                hours,
                rateText,
                amount.toFixed(2),
                note
            ]);
        });
        
        // 添加统计数据
        data.push([], ['统计项', '数值', '', '', '', '']);
        data.push(['标准工资', `${state.baseSalary.toFixed(2)}元`, '', '', '', '']);
        data.push(['本月总加班时长', state.domCache.monthlyOvertime.textContent, '', '', '', '']);
        data.push(['本月总请假', state.domCache.monthlyLeave.textContent, '', '', '', '']);
        data.push(['本月加班费', state.domCache.monthlyOvertimePay.textContent, '', '', '', '']);
        data.push(['预计实发工资', state.domCache.estimatedSalary.textContent, '', '', '', '']);
        
        // 创建工作簿
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.aoa_to_sheet(data);
        XLSX.utils.book_append_sheet(wb, ws, '工作记录');
        
        // 导出文件
        const fileName = `工作记录_${formatDate(new Date())}.xlsx`;
        XLSX.writeFile(wb, fileName);
        
        showMessage('Excel导出成功', 'text-success');
    }
    
    // 导入数据
    function importData(event) {
        const file = event.target.files[0];
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = function(e) {
            try {
                let newData = {};
                
                if (file.name.endsWith('.json')) {
                    // 导入JSON数据
                    const data = JSON.parse(e.target.result);
                    if (data && typeof data === 'object') {
                        newData = data;
                    } else {
                        throw new Error('无效的JSON数据');
                    }
                } else if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
                    // 导入Excel数据
                    const wb = XLSX.read(e.target.result, { type: 'array' });
                    const ws = wb.Sheets[wb.SheetNames[0]];
                    const jsonData = XLSX.utils.sheet_to_json(ws);
                    
                    jsonData.forEach(row => {
                        if (row['日期'] && (row['工作时数'] || row['类型'])) {
                            const dateMatch = row['日期'].match(/(\d+)年(\d+)月(\d+)日/);
                            if (dateMatch) {
                                const year = parseInt(dateMatch[1]);
                                const month = parseInt(dateMatch[2]) - 1;
                                const day = parseInt(dateMatch[3]);
                                const date = new Date(year, month, day);
                                const dateStr = formatDate(date);
                                
                                const hours = parseFloat(row['工作时数']) || 0;
                                let type = 'A';
                                
                                if (row['类型']) {
                                    if (row['类型'].includes('3倍') || row['类型'].includes('节假日')) {
                                        type = 'C';
                                    } else if (row['类型'].includes('2倍') || row['类型'].includes('周末') || row['类型'].includes('调休日')) {
                                        type = 'B';
                                    }
                                }
                                
                                if (hours !== 0) {
                                    newData[dateStr] = {
                                        date: dateStr,
                                        hours: hours,
                                        type: hours > 0 ? type : null,
                                        timestamp: new Date().toISOString()
                                    };
                                }
                            }
                        }
                    });
                }
                
                // 合并数据
                state.hoursData = { ...state.hoursData, ...newData };
                saveToLocalStorage();
                render();
                showMessage('数据导入成功', 'text-success');
            } catch (error) {
                console.error('导入数据失败:', error);
                showMessage(`导入数据失败: ${error.message}`, 'text-danger');
            }
            
            // 清除文件输入
            event.target.value = '';
        };
        
        if (file.name.endsWith('.json')) {
            reader.readAsText(file);
        } else {
            reader.readAsArrayBuffer(file);
        }
    }
    
    // 修复清除所有数据功能
    function clearAllData() {
        if (confirm('确定要清除所有记录吗？此操作不可恢复！')) {
            localStorage.removeItem('hoursData');
            localStorage.removeItem('baseSalary');
            
            state.hoursData = {};
            state.baseSalary = 4600;
            state.domCache.baseSalaryInput.value = state.baseSalary;
            
            render();
            updateSalaryConfig();
            showMessage('所有记录已清除', 'text-success');
        }
    }
    
    // 切换主题
    function toggleTheme() {
        state.darkMode = !state.darkMode;
        applyTheme();
        saveToLocalStorage();
    }
    
    // 应用主题
    function applyTheme() {
        if (state.darkMode) {
            document.documentElement.setAttribute('data-theme', 'dark');
            state.domCache.themeToggle.innerHTML = '<i class="bi bi-sun-fill"></i> 浅色模式';
        } else {
            document.documentElement.setAttribute('data-theme', 'light');
            state.domCache.themeToggle.innerHTML = '<i class="bi bi-moon-fill"></i> 深色模式';
        }
    }
    
    // 显示消息
    function showMessage(message, className) {
        state.domCache.hoursMessage.textContent = message;
        state.domCache.hoursMessage.className = className;
    }
    
    // 保存数据到本地存储
    function saveToLocalStorage() {
        localStorage.setItem('hoursData', JSON.stringify(state.hoursData));
        localStorage.setItem('baseSalary', state.baseSalary.toString());
        localStorage.setItem('theme', state.darkMode ? 'dark' : 'light');
    }
    
    // 初始化日期选择器
    function initDateSelectors() {
        const currentYear = new Date().getFullYear();
        
        // 填充年份选择器（前后5年）
        state.domCache.yearSelector.innerHTML = '';
        for (let year = currentYear - 5; year <= currentYear + 5; year++) {
            const option = document.createElement('option');
            option.value = year;
            option.textContent = year + '年';
            state.domCache.yearSelector.appendChild(option);
        }
        
        // 填充月份选择器
        state.domCache.monthSelector.innerHTML = '';
        MONTH_NAMES.forEach((month, index) => {
            const option = document.createElement('option');
            option.value = index + 1;
            option.textContent = month;
            state.domCache.monthSelector.appendChild(option);
        });
        
        updateDateSelectors();
    }
    
    // 更新日期选择器选中状态
    function updateDateSelectors() {
        state.domCache.yearSelector.value = state.currentDate.getFullYear();
        state.domCache.monthSelector.value = state.currentDate.getMonth() + 1;
    }
    
    // 处理日期选择变化
    function handleDateSelection() {
        const year = parseInt(state.domCache.yearSelector.value);
        const month = parseInt(state.domCache.monthSelector.value) - 1;
        
        state.currentDate = new Date(year, month, 1);
        render();
    }
    
    // 改变月份
    function changeMonth(offset) {
        const newMonth = state.currentDate.getMonth() + offset;
        state.currentDate = new Date(state.currentDate.getFullYear(), newMonth, 1);
        render();
    }
    
    // 初始化记录选择器
    function initRecordsSelectors() {
        const currentYear = new Date().getFullYear();
        
        // 填充年份选择器
        state.domCache.yearSelect.innerHTML = '';
        for (let year = currentYear - 5; year <= currentYear + 5; year++) {
            const option = document.createElement('option');
            option.value = year;
            option.textContent = year + '年';
            if (year === state.recordsViewYear) {
                option.selected = true;
            }
            state.domCache.yearSelect.appendChild(option);
        }
        
        // 设置当前选中月份
        state.domCache.monthSelect.value = state.recordsViewMonth;
    }
    
    // 修复记录视图月份切换
    function changeRecordsMonth(offset) {
        state.recordsViewMonth += offset;
        
        if (state.recordsViewMonth < 1) {
            state.recordsViewMonth = 12;
            state.recordsViewYear--;
        } else if (state.recordsViewMonth > 12) {
            state.recordsViewMonth = 1;
            state.recordsViewYear++;
        }
        
        // 更新选择器值
        state.domCache.yearSelect.value = state.recordsViewYear;
        state.domCache.monthSelect.value = state.recordsViewMonth;
        
        state.recordsViewMode = 'specific';
        updateRecordsView();
    }
    
    // 显示当前月记录
    function showCurrentMonthRecords() {
        state.recordsViewYear = state.currentDate.getFullYear();
        state.recordsViewMonth = state.currentDate.getMonth() + 1;
        state.recordsViewMode = 'current';
        updateRecordsView();
    }
    
    // 显示所有记录
    function showAllRecords() {
        state.recordsViewMode = 'all';
        updateRecordsView();
    }
    
    // 跳转到选定日期
    function goToSelectedDate() {
        state.recordsViewYear = parseInt(state.domCache.yearSelect.value);
        state.recordsViewMonth = parseInt(state.domCache.monthSelect.value);
        state.recordsViewMode = 'specific';
        updateRecordsView();
    }
    
    // 格式化日期为YYYY-MM-DD
    function formatDate(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }
    
    // 启动应用
    init();
})();
