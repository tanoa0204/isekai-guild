const generateBtn = document.getElementById('generate-btn');
const questList = document.getElementById('quest-list');
const emptyBoardMessage = document.getElementById('empty-board-message');

const nameModal = document.getElementById('name-modal');
const playerNameInput = document.getElementById('player-name-input');
const startGameBtn = document.getElementById('start-game-btn');
const playerNameDisplay = document.getElementById('player-name-display');

const hpBarFill = document.getElementById('hp-bar-fill');
const hpText = document.getElementById('hp-text');
const rankDisplay = document.getElementById('rank-display');

const gameoverModal = document.getElementById('gameover-modal');
const gameoverMessage = document.getElementById('gameover-message');
const finalRankDisplay = document.getElementById('final-rank-display');
const restartBtn = document.getElementById('restart-btn');

// ===== ゲーム状態（保存なし・リロードで完全初期化） =====
const MAX_HP = 100;
let state = {
    name: "",
    hp: MAX_HP,
    score: 0,
    questsCompleted: 0
};

const RANKS = [
    { min: 0,   label: "F（荷物持ち）" },
    { min: 40,  label: "E（下働き）" },
    { min: 90,  label: "D（見習い）" },
    { min: 150, label: "C（一人前）" },
    { min: 230, label: "B（熟練）" },
    { min: 330, label: "A（英雄候補）" },
    { min: 450, label: "S（伝説）" }
];

function getRankLabel(score) {
    let current = RANKS[0].label;
    for (const r of RANKS) {
        if (score >= r.min) current = r.label;
    }
    return current;
}

// 危険度(difficulty)に応じたタグ表示
function getDifficultyTag(difficulty) {
    if (difficulty >= 9) return "【自殺行為】";
    if (difficulty >= 7) return "【超高難度】";
    if (difficulty >= 5) return "【高難度】";
    if (difficulty >= 3) return "【緊急】";
    return "【お使い】";
}

// ===== 名前入力 =====
startGameBtn.addEventListener('click', () => {
    const name = playerNameInput.value.trim();
    state.name = name || "名無しの冒険者";
    playerNameDisplay.innerText = state.name;
    nameModal.classList.add('hidden');
    updateStatusBar();
});

playerNameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') startGameBtn.click();
});

restartBtn.addEventListener('click', () => {
    location.reload();
});

// ===== ステータスバー更新 =====
function updateStatusBar() {
    const hpPercent = Math.max(0, (state.hp / MAX_HP) * 100);
    hpBarFill.style.width = `${hpPercent}%`;
    hpText.innerText = `${Math.max(0, state.hp)} / ${MAX_HP}`;

    if (hpPercent > 50) {
        hpBarFill.style.backgroundColor = "#66bb6a";
    } else if (hpPercent > 20) {
        hpBarFill.style.backgroundColor = "#fbc02d";
    } else {
        hpBarFill.style.backgroundColor = "#c62828";
    }

    rankDisplay.innerText = getRankLabel(state.score);
}

// ===== クエスト生成 =====
generateBtn.addEventListener('click', async () => {
    generateBtn.innerText = "ギルドマスターに申請中...";
    generateBtn.disabled = true;

    try {
        const response = await fetch('/api/generate-quest');
        const quest = await response.json();

        if (quest.error) {
            alert(`エラー: ${quest.error}`);
            return;
        }

        // 最初のクエストが出たら「掲示板が空です」メッセージを消す
        if (emptyBoardMessage) {
            emptyBoardMessage.remove();
        }

        const hpCost = Number(quest.hpCost) || 10;
        const rewardValue = Number(quest.rewardValue) || 5;
        const difficulty = Number(quest.difficulty) || 5;

        const card = document.createElement('div');
        card.className = 'quest-card';
        card.dataset.hpCost = hpCost;
        card.dataset.rewardValue = rewardValue;
        card.innerHTML = `
            <div class="quest-tag">${getDifficultyTag(difficulty)}</div>
            <h3 class="quest-title">${quest.title}</h3>
            <p class="quest-details"><strong>詳細:</strong> ${quest.details}</p>
            <p class="quest-reward"><strong>報酬:</strong> ${quest.reward}</p>
            <div class="quest-meta">
                <span class="meta-hp">体力消費: ${hpCost}</span>
                <span class="meta-value">価値: ${rewardValue}pt</span>
            </div>
            <button class="order-btn">受注する（血の契約）</button>
        `;

        questList.insertBefore(card, questList.firstChild);

        const orderBtn = card.querySelector('.order-btn');
        initFleeButton(orderBtn);
        orderBtn.addEventListener('click', () => acceptQuest(card));

    } catch (error) {
        alert("通信エラー：ギルドの伝書鳩が撃ち落とされました。");
    } finally {
        generateBtn.innerText = "GENERATE UNREASONABLE QUEST";
        generateBtn.disabled = false;
    }
});

// ===== クエスト受注処理 =====
function acceptQuest(card) {
    if (state.hp <= 0) return;

    const hpCost = Number(card.dataset.hpCost) || 10;
    const rewardValue = Number(card.dataset.rewardValue) || 5;

    state.hp -= hpCost;
    state.score += rewardValue;
    state.questsCompleted += 1;

    card.classList.add('accepted');
    updateStatusBar();

    if (state.hp <= 0) {
        triggerGameOver();
    }
}

// ===== 逃げるギミック =====
function initFleeButton(button) {
    button.addEventListener('mouseover', () => {
        const randomX = Math.random() * 150 - 75;
        const randomY = Math.random() * 100 - 50;

        button.style.transform = `translate(${randomX}px, ${randomY}px)`;
        button.style.transition = "transform 0.1s ease";

        if (Math.random() > 0.7) {
            button.innerText = "嫌だ！！行きたくない！！";
        }
    });
}

// ===== ゲームオーバー処理 =====
function triggerGameOver() {
    generateBtn.disabled = true;
    document.querySelectorAll('.order-btn').forEach(btn => btn.disabled = true);

    gameoverMessage.innerText =
        `${state.name}は${state.questsCompleted}件のクエストをこなし、力尽きました。`;
    finalRankDisplay.innerText = `最終ギルドランク：${getRankLabel(state.score)}（${state.score}pt）`;

    gameoverModal.classList.remove('hidden');
}

// 初期表示
updateStatusBar();
