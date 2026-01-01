// holiday-config.js
// 节假日配置系统

const holidayConfig = {
    // 2026年节假日配置
    2026: {
        // 法定节假日（3倍工资）
        holidays: [
            '2026-01-01',  // 元旦
            '2026-02-16', '2026-02-17', '2026-02-18', '2026-02-19', // 春节（2月8日为除夕）
            '2026-04-05', // 清明节
            '2026-05-01', '2026-05-02',  // 劳动节
            '2026-06-19', // 端午节
            '2026-10-01', '2026-10-02', '2026-10-03', // 国庆节
            '2026-09-25', // 中秋节（与国庆节相邻）
        ],
        // 调休日（周末上班但按2倍计算）
        extraWorkDays: [
            '2026-01-02',
            '2026-02-20', '2026-02-23', // 春节调休（2月7日周六、2月20日周五上班）
            '2026-05-04', '2026-05-05', // 劳动节调休（4月25日周六、5月8日周五上班）
            '2026-06-27', // 端午节调休（6月27日周六上班）
            '2026-09-19', '2026-10-09', // 中秋国庆调休（9月19日周六、10月9日周五上班）
            '2026-10-05', '2026-10-06', '2026-10-07',
        ],
        // 补班日（工作日上班，按1.5倍计算）
        makeUpWorkDays: [
            '2026-01-04',
            '2026-02-14', '2026-02-28', // 春节补班
            '2026-05-09', // 劳动节补班
            '2026-06-27', // 端午节补班
            '2026-09-20', // 中秋国庆补班
            '2026-10-10',
        ]
    },
    // 2027年节假日配置（预留）
    2027: {
        holidays: [],
        extraWorkDays: [],
        makeUpWorkDays: []
    }
};

// 日期类型相关函数
function getDateType(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const dateString = `${year}-${month}-${day}`;
    
    const yearConfig = holidayConfig[year];

    if (!yearConfig) {
        // 如果没有该年份的配置，按默认逻辑处理
        const dayOfWeek = date.getDay();
        return dayOfWeek === 0 || dayOfWeek === 6 ? 'weekend' : 'workday';
    }

    if (yearConfig.holidays.includes(dateString)) {
        return 'holiday';
    } else if (yearConfig.extraWorkDays.includes(dateString)) {
        return 'extraWork';
    } else if (yearConfig.makeUpWorkDays.includes(dateString)) {
        return 'makeUpWork';
    } else {
        const dayOfWeek = date.getDay();
        return dayOfWeek === 0 || dayOfWeek === 6 ? 'weekend' : 'workday';
    }
}

// 获取加班倍率的函数
function getOvertimeMultiplier(date) {
    const dateType = getDateType(date);

    switch (dateType) {
        case 'holiday':
            return 3; // 法定节假日3倍
        case 'weekend':
        case 'extraWork':
            return 2; // 周末和调休日2倍
        case 'workday':
        case 'makeUpWork':
        default:
            return 1.5; // 工作日和补班日1.5倍
    }
}
