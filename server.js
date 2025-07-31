const express = require('express');
const axios = require('axios');
const moment = require('moment');

const app = express();
const PORT = 3000;

// ================= CẤU HÌNH =================
const API_URL = 'https://api.wsktnus8.net/v2/history/getLastResult?gameId=ktrng_3979&size=100&tableId=39791215743193&curPage=1';
const UPDATE_INTERVAL = 5000; // 5 giây
const MIN_HISTORY = 10; // Số phiên tối thiểu để phân tích

// ================= BIẾN TOÀN CỤC =================
let historyData = [];
let systemStats = {
    startTime: new Date(),
    totalRequests: 0,
    predictionsMade: 0,
    lastUpdate: null,
    accuracy: null
};

// ================= CÁC HÀM HỖ TRỢ =================

// Cập nhật dữ liệu từ API
async function updateHistory() {
    try {
        const { data } = await axios.get(API_URL);
        if (data?.data?.resultList) {
            historyData = data.data.resultList;
            systemStats.lastUpdate = new Date();
            console.log(`[${moment().format('HH:mm:ss')}] Cập nhật dữ liệu thành công, ${historyData.length} phiên`);
        }
    } catch (error) {
        console.error('Lỗi khi cập nhật dữ liệu:', error.message);
    }
}

// Xác định kết quả Tài/Xỉu/Bão
function getResultType(session) {
    if (!session) return "";
    const [d1, d2, d3] = session.facesList;
    if (d1 === d2 && d2 === d3) return "Bão";
    return session.score >= 11 ? "Tài" : "Xỉu";
}

// Tạo chuỗi pattern
function generatePattern(history, length = 15) {
    return history.slice(0, length)
        .map(s => getResultType(s).charAt(0))
        .reverse()
        .join('');
}

// Phân tích nhịp xúc xắc
function analyzeDiceRhythm(history, lookback = 10) {
    if (history.length < lookback) return null;

    const analysis = {
        dice1: { values: [], hot: [], cold: [] },
        dice2: { values: [], hot: [], cold: [] },
        dice3: { values: [], hot: [], cold: [] }
    };

    // Lấy dữ liệu các phiên gần nhất
    const recent = history.slice(0, lookback);
    
    // Phân tích từng xúc xắc
    for (let i = 0; i < 3; i++) {
        const diceKey = `dice${i+1}`;
        analysis[diceKey].values = recent.map(x => x.facesList[i]);
        
        // Tính tần suất
        const freq = {};
        analysis[diceKey].values.forEach(v => freq[v] = (freq[v] || 0) + 1);
        
        // Số hot (xuất hiện nhiều)
        analysis[diceKey].hot = Object.entries(freq)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 2)
            .map(x => parseInt(x[0]));
        
        // Số cold (ít xuất hiện)
        analysis[diceKey].cold = [];
        for (let num = 1; num <= 6; num++) {
            if (!freq[num]) analysis[diceKey].cold.push(num);
        }
        if (analysis[diceKey].cold.length === 0) {
            analysis[diceKey].cold = Object.entries(freq)
                .sort((a, b) => a[1] - b[1])
                .slice(0, 2)
                .map(x => parseInt(x[0]));
        }
    }

    return analysis;
}

// Dự đoán vị (3 số)
function predictNumbers(history) {
    const analysis = analyzeDiceRhythm(history) || {};
    const picks = [];
    
    // Ưu tiên lấy 2 số hot và 1 số cold
    if (analysis.dice1 && analysis.dice2 && analysis.dice3) {
        picks.push(analysis.dice1.hot[0]);
        picks.push(analysis.dice2.hot[0]);
        picks.push(analysis.dice3.cold[0]);
    }
    
    // Đảm bảo không trùng số
    const uniquePicks = [...new Set(picks)];
    while (uniquePicks.length < 3) {
        uniquePicks.push(Math.floor(Math.random() * 6) + 1);
    }
    
    return uniquePicks.slice(0, 3).sort((a, b) => a - b);
}

// Dự đoán chính (Tài/Xỉu)
function predictMain(history) {
    if (history.length < 5) return "Tài";
    
    const pattern = generatePattern(history, 5);
    const lastResults = pattern.split('').slice(0, 3);
    
    // Ưu tiên bắt cầu ngắn
    if (lastResults.every(r => r === 'T')) return "Xỉu";
    if (lastResults.every(r => r === 'X')) return "Tài";
    
    // Fallback: Phân tích điểm
    const avgScore = history.slice(0, 3)
        .reduce((sum, x) => sum + x.score, 0) / 3;
    return avgScore >= 10.5 ? "Xỉu" : "Tài";
}

// Tính độ chính xác
function calculateAccuracy() {
    if (historyData.length < 20) return null;
    
    let correct = 0;
    for (let i = 0; i < historyData.length - 1; i++) {
        const actual = getResultType(historyData[i]);
        const predicted = predictMain(historyData.slice(i + 1));
        if (actual === predicted) correct++;
    }
    
    return (correct / (historyData.length - 1)).toFixed(2);
}

// ================= CÁC ENDPOINT =================

// 1. Endpoint chính - Dự đoán
app.get('/predict', async (req, res) => {
    systemStats.totalRequests++;
    try {
        await updateHistory();
        const latest = historyData[0] || {};
        const canPredict = historyData.length >= MIN_HISTORY;
        
        if (canPredict) systemStats.predictionsMade++;
        
        res.json({
            Id: "binhtool90",
            Phien: latest.gameNum ? parseInt(latest.gameNum.replace('#', '')) + 1 : 0,
            Xuc_xac_1: latest.facesList?.[0] || 0,
            Xuc_xac_2: latest.facesList?.[1] || 0,
            Xuc_xac_3: latest.facesList?.[2] || 0,
            Tong: latest.score || 0,
            Ket_qua: getResultType(latest),
            Pattern: canPredict ? generatePattern(historyData) : "",
            Du_doan: canPredict ? predictMain(historyData) : "",
            doan_vi: canPredict ? predictNumbers(historyData) : [0, 0, 0]
        });
    } catch (error) {
        console.error('Lỗi:', error);
        res.status(500).json({
            error: "Lỗi hệ thống",
            details: error.message
        });
    }
});

// 2. Thống kê hệ thống
app.get('/stats', (req, res) => {
    systemStats.accuracy = calculateAccuracy();
    res.json({
        status: "running",
        uptime: moment.duration(process.uptime(), 'seconds').humanize(),
        data: {
            totalSessions: historyData.length,
            lastUpdated: systemStats.lastUpdate 
                ? moment(systemStats.lastUpdate).fromNow() 
                : "never"
        },
        performance: {
            accuracy: systemStats.accuracy,
            requests: systemStats.totalRequests,
            predictions: systemStats.predictionsMade
        }
    });
});

// 3. Lịch sử phiên
app.get('/history', (req, res) => {
    const count = Math.min(parseInt(req.query.count) || 10, 50);
    const data = historyData.slice(0, count).map(x => ({
        phien: x.gameNum,
        xuc_xac: x.facesList,
        tong: x.score,
        ket_qua: getResultType(x),
        time: x.time
    }));
    
    res.json({
        count: data.length,
        data: data.reverse() // Hiển thị từ cũ đến mới
    });
});

// 4. Phân tích chi tiết phiên
app.get('/analyze/:phien', (req, res) => {
    const session = historyData.find(x => x.gameNum === `#${req.params.phien}`);
    if (!session) {
        return res.status(404).json({ error: "Không tìm thấy phiên" });
    }
    
    const index = historyData.findIndex(x => x.gameNum === `#${req.params.phien}`);
    const context = historyData.slice(index, index + 5);
    const analysis = analyzeDiceRhythm(context) || {};
    
    res.json({
        phien: session.gameNum,
        time: session.time,
        details: {
            xuc_xac: session.facesList,
            tong: session.score,
            ket_qua: getResultType(session)
        },
        analysis: {
            dice1: {
                values: analysis.dice1?.values || [],
                hot: analysis.dice1?.hot || [],
                cold: analysis.dice1?.cold || []
            },
            dice2: {
                values: analysis.dice2?.values || [],
                hot: analysis.dice2?.hot || [],
                cold: analysis.dice2?.cold || []
            },
            pattern: generatePattern(context, 5)
        },
        neighbors: {
            previous: index < historyData.length - 1 ? historyData[index + 1].gameNum : null,
            next: index > 0 ? historyData[index - 1].gameNum : null
        }
    });
});

// 5. Health check
app.get('/health', (req, res) => {
    res.json({
        status: "healthy",
        version: "1.0.0",
        uptime: process.uptime(),
        database: {
            connected: historyData.length > 0,
            size: historyData.length
        }
    });
});

// ================= KHỞI ĐỘNG SERVER =================
app.listen(PORT, () => {
    console.log(`🚀 Server đang chạy tại http://localhost:${PORT}`);
    updateHistory();
    setInterval(updateHistory, UPDATE_INTERVAL);
});
