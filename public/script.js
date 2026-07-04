const generateBtn = document.getElementById('generate-btn');
const questList = document.getElementById('quest-list');

// 1. Groq API (Vercel経由) からクエトを取得して画面に追加する
generateBtn.addEventListener('click', async () => {
    generateBtn.innerText = "ギルドマスターに申請中...";
    generateBtn.disabled = true;

    try {
        // Vercelのサーバーレス関数を呼び出す
        const response = await fetch('/api/generate-quest');
        const quest = await response.json();

        // 新しいクエストカードをHTMLで作る
        const card = document.createElement('div');
        card.className = 'quest-card';
        card.innerHTML = `
            <div class="quest-tag">【緊急】</div>
            <h3 class="quest-title">${quest.title}</h3>
            <p class="quest-details"><strong>詳細:</strong> ${quest.details}</p>
            <p class="quest-reward"><strong>報酬:</strong> ${quest.reward}</p>
            <button class="order-btn">受注する（血の契約）</button>
        `;

        // 掲示板の一番上に追加
        questList.insertBefore(card, questList.firstChild);

        // 新しく追加されたカードのボタンにも「逃げるギミック」を仕込む
        initFleeButton(card.querySelector('.order-btn'));

    } catch (error) {
        alert("通信エラー：ギルドの伝書鳩が撃ち落とされました。");
    } finally {
        generateBtn.innerText = "GENERATE UNREASONABLE QUEST";
        generateBtn.disabled = false;
    }
});

// 2. ウザいギミック：「受注する」ボタンにマウスが近づくと逃げる関数
function initFleeButton(button) {
    button.addEventListener('mouseover', () => {
        // カード内でのランダムな位置にボタンをぶっ飛ばす
        const randomX = Math.random() * 150 - 75; // -75px 〜 75px
        const randomY = Math.random() * 100 - 50;  // -50px 〜 50px
        
        button.style.transform = `translate(${randomX}px, ${randomY}px)`;
        button.style.transition = "transform 0.1s ease";
        
        // 確率でボタンの文字がおかしくなる
        if(Math.random() > 0.7) {
            button.innerText = "嫌だ！！行きたくない！！";
        }
    });
}

// 最初からあるカードのボタンにもギミックを適用しておく
document.querySelectorAll('.order-btn').forEach(initFleeButton);
