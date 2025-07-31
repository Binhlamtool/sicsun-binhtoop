const express = require("express");
const axios = require("axios");
const cors = require("cors");

const app = express();
app.use(cors());

const PORT = process.env.PORT || 3000;
const API_URL = "https://api.wsktnus8.net/v2/history/getLastResult?gameId=ktrng_3979&size=100&tableId=39791215743193&curPage=1";

let lastGameNum = null;
let latestPrediction = null;

function getKetQua(tong) {
  return tong >= 11 ? "Tài" : "Xỉu";
}

function getPattern(history) {
  return history.map(item => getKetQua(item.Tong) === "Tài" ? "t" : "x").join("");
}

function randomDoanVi(kq, diceList) {
  const rand = kq === "Tài"
    ? Math.floor(Math.random() * 7) + 11   // 11-17
    : Math.floor(Math.random() * 7) + 4;   // 4-10

  // Phân tích 2 xúc xắc thường xuất hiện nhất gần đây
  const freq = {};
  diceList.flat().forEach(d => {
    freq[d] = (freq[d] || 0) + 1;
  });

  const sortedFaces = Object.keys(freq).sort((a, b) => freq[b] - freq[a]).map(Number);

  const bonus1 = sortedFaces[0] + sortedFaces[1] + 1;
  const bonus2 = sortedFaces[1] + sortedFaces[2] + 1;

  return [rand, bonus1, bonus2];
}

async function fetchData() {
  try {
    const res = await axios.get(API_URL);
    const list = res.data?.data?.resultList;
    if (!list || list.length === 0) return;

    const newest = list[0];
    if (newest.gameNum === lastGameNum) return;

    lastGameNum = newest.gameNum;

    const [xx1, xx2, xx3] = newest.facesList;
    const tong = xx1 + xx2 + xx3;
    const ket_qua = getKetQua(tong);

    const lich_su_dice = list.slice(1, 10).map(i => i.facesList); // Lịch sử gần đây
    const doan_vi = randomDoanVi(ket_qua, lich_su_dice);

    latestPrediction = {
      Phien: parseInt(newest.gameNum.replace("#", "")),
      Xuc_xac_1: xx1,
      Xuc_xac_2: xx2,
      Xuc_xac_3: xx3,
      Tong: tong,
      Ket_qua: ket_qua,
      Pattern: getPattern(list.slice(0, 10).map(i => ({
        Tong: i.score
      }))),
      Du_doan: ket_qua === "Tài" ? "Xỉu" : "Tài", // Dự đoán ngược để test
      doan_vi: doan_vi
    };

    console.log("✅ Dữ liệu mới:", latestPrediction);

  } catch (err) {
    console.error("❌ Lỗi fetch:", err.message);
  }
}

// Fetch mỗi 5s
setInterval(fetchData, 5000);

// Endpoint trả dữ liệu mới nhất
app.get("/prediction", (req, res) => {
  if (latestPrediction) {
    res.json(latestPrediction);
  } else {
    res.status(503).json({ message: "Dữ liệu chưa sẵn sàng" });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Server đang chạy tại http://localhost:${PORT}`);
});
