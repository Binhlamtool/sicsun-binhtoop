const express = require('express');
const axios = require('axios');
const moment = require('moment');

const app = express();
const PORT = 3000;

// ================= CẤU HÌNH =================
const API_URL = 'https://api.wsktnus8.net/v2/history/getLastResult?gameId=ktrng_3979&size=100&tableId=39791215743193&curPage=1';
const UPDATE_INTERVAL = 5000;
const MIN_HISTORY = 10;

// ================= BIẾN TOÀN CỤC =================
let historyData = [];
let systemStats = {
    startTime: new Date(),
    totalRequests: 0,
    predictionsMade: 0,
    lastUpdate: null
};

// ================= CÁC HÀM HỖ TRỢ =================

// Cập nhật dữ liệu
async function updateHistory() {
    try {
        const { data } = await axios.get(API_URL);
        if (data?.data?.resultList) {
            historyData = data.data.resultList;
            systemStats.lastUpdate = new Date();
        }
    } catch (error) {
        console.error('Lỗi cập nhật:', error.message);
    }
}

// Xác định kết quả
function getResultType(session) {
    if (!session) return "";
    const [d1, d2, d3] = session.facesList;
    if (d1 === d2 && d2 === d3) return "Bão";
    return session.score >= 11 ? "Tài" : "Xỉu";
}

// Tạo pattern
function generatePattern(history, length = 15) {
    return history.slice(0, length)
        .map(s => getResultType(s).charAt(0))
        .reverse()
        .join('');
}

// Dự đoán tổng điểm (4-17)
function predictSums(history) {
    if (history.length < 5) return [8, 10, 12]; // Fallback
    
    const lastScores = history.slice(0, 5).map(x => x.score);
    const avgScore = lastScores.reduce((a, b) => a + b, 0) / 5;
    const trend = avgScore >= 10.5 ? 'Tài' : 'Xỉu';
    
    // Tạo dự đoán phù hợp xu hướng
    if (trend === 'Tài') {
        return [
            Math.min(Math.max(Math.round(avgScore), 11), 15),
            11 + Math.floor(Math.random() * 3),
            15 - Math.floor(Math.random() * 2)
        ].sort((a, b) => a - b);
    } else {
        return [
            Math.max(Math.min(Math.round(avgScore), 10), 5),
            5 + Math.floor(Math.random() * 3),
            10 - Math.floor(Math.random() * 2)
        ].sort((a, b) => a - b);
    }
}

// Dự đoán chính
function predictMain(history) {
    if (history.length < 5) return "Tài";
    
    const pattern = generatePattern(history, 5);
    const lastResults = pattern.split('').slice(0, 3);
    
    if (lastResults.every(r => r === 'T')) return "Xỉu";
    if (lastResults.every(r => r === 'X')) return "Tài";
    
    const avgScore = history.slice(0, 3)
        .reduce((sum, x) => sum + x.score, 0) / 3;
    return avgScore >= 10.5 ? "Xỉu" : "Tài";
}

// ================= ENDPOINTS =================

// Endpoint chính
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
            doan_vi: canPredict ? predictSums(historyData) : [0, 0, 0]
        });
    } catch (error) {
        res.status(500).json({
            error: "Lỗi hệ thống",
            details: error.message
        });
    }
});

// Khởi động server
app.listen(PORT, () => {
    console.log(`Server đang chạy tại http://localhost:${PORT}`);
    updateHistory();
    setInterval(updateHistory, UPDATE_INTERVAL);
});
