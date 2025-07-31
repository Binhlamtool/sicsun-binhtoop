const express = require('express');
const axios = require('axios');

const app = express();
const PORT = 3000;

// --- Cấu hình ---
const API_URL = 'https://api.wsktnus8.net/v2/history/getLastResult?gameId=ktrng_3979&size=100&tableId=39791215743193&curPage=1';
const UPDATE_INTERVAL = 5000;
const MIN_HISTORY = 10;

// =================================================================
// CORE FUNCTIONS
// =================================================================

let historyData = [];

// Phân tích nhịp xúc xắc chi tiết
function analyzeDiceRhythm(history) {
    if (history.length < 5) return null;
    
    const lastFive = history.slice(0, 5);
    const diceTrends = [0, 1, 2].map(i => ({
        face: i+1,
        values: lastFive.map(x => x.facesList[i]),
        hot: [],
        cold: []
    }));
    
    // Phát hiện số hot/cold cho từng xúc xắc
    diceTrends.forEach(dice => {
        const freq = {};
        dice.values.forEach(v => freq[v] = (freq[v] || 0) + 1);
        
        // Số xuất hiện nhiều nhất (hot)
        dice.hot = Object.entries(freq)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 2)
            .map(x => parseInt(x[0]));
        
        // Số chưa xuất hiện (cold)
        dice.cold = [];
        for (let i = 1; i <= 6; i++) {
            if (!freq[i]) dice.cold.push(i);
        }
        if (dice.cold.length === 0) {
            dice.cold = Object.entries(freq)
                .sort((a, b) => a[1] - b[1])
                .slice(0, 2)
                .map(x => parseInt(x[0]));
        }
    });
    
    return diceTrends;
}

// Dự đoán vị dựa trên xu hướng
function predictNumbers(history) {
    const rhythm = analyzeDiceRhythm(history);
    if (!rhythm) return [2, 4, 6]; // Fallback
    
    // Lấy 1 số hot và 1 số cold từ mỗi xúc xắc
    const hotPicks = rhythm.map(d => d.hot[0]);
    const coldPicks = rhythm.map(d => d.cold[0]);
    
    // Kết hợp 2 số hot và 1 số cold
    return [...new Set([...hotPicks.slice(0,2), coldPicks[2]])].slice(0, 3);
}

// =================================================================
// API ENDPOINT
// =================================================================
app.get('/predict', async (req, res) => {
    try {
        await updateHistory();
        const latest = historyData[0] || {};
        const canPredict = historyData.length >= MIN_HISTORY;
        
        res.json({
            Id: "binhtool90",
            Phien: latest.gameNum ? parseInt(latest.gameNum.replace('#', '')) + 1 : 0,
            Xuc_xac_1: latest.facesList ? latest.facesList[0] : 0,
            Xuc_xac_2: latest.facesList ? latest.facesList[1] : 0,
            Xuc_xac_3: latest.facesList ? latest.facesList[2] : 0,
            Tong: latest.score || 0,
            Ket_qua: latest.score ? getResultType(latest) : "",
            Pattern: canPredict ? generatePattern(historyData) : "",
            Du_doan: canPredict ? predictMain(historyData) : "",
            doan_vi: canPredict ? predictNumbers(historyData) : [0, 0, 0]
        });
        
    } catch (error) {
        console.error('Error:', error);
        res.json(getErrorResponse());
    }
});

// =================================================================
// HELPER FUNCTIONS
// =================================================================
function getResultType(session) {
    if (!session?.facesList) return "";
    const sameFace = session.facesList[0] === session.facesList[1] && 
                     session.facesList[1] === session.facesList[2];
    return sameFace ? "Bão" : (session.score >= 11 ? "Tài" : "Xỉu");
}

function generatePattern(history, length = 10) {
    return history.slice(0, length)
        .map(s => getResultType(s).charAt(0))
        .reverse()
        .join('');
}

function predictMain(history) {
    if (history.length < 3) return "Tài";
    const lastThree = history.slice(0, 3).map(x => x.score);
    const avg = lastThree.reduce((a, b) => a + b, 0) / 3;
    return avg >= 10.5 ? "Xỉu" : "Tài";
}

async function updateHistory() {
    try {
        const { data } = await axios.get(API_URL);
        historyData = data?.data?.resultList || historyData;
    } catch (error) {
        console.error('Update error:', error.message);
    }
}

function getErrorResponse() {
    return {
        Id: "binhtool90",
        Phien: 0,
        Xuc_xac_1: 0,
        Xuc_xac_2: 0,
        Xuc_xac_3: 0,
        Tong: 0,
        Ket_qua: "",
        Pattern: "",
        Du_doan: "",
        doan_vi: [0, 0, 0]
    };
}

// =================================================================
// START SERVER
// =================================================================
app.listen(PORT, () => {
    console.log(`Dice Predictor running at http://localhost:${PORT}`);
    setInterval(updateHistory, UPDATE_INTERVAL);
});
