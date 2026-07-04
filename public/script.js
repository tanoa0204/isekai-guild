const generateBtn = document.getElementById('generate-btn');
const gambleBtn = document.getElementById('gamble-btn');
const questList = document.getElementById('quest-list');
const emptyBoardMessage = document.getElementById('empty-board-message');

const nameModal = document.getElementById('name-modal');
const playerNameInput = document.getElementById('player-name-input');
const startGameBtn = document.getElementById('start-game-btn');
const playerNameDisplay = document.getElementById('player-name-display');

const hpBarFill = document.getElementById('hp-bar-fill');
const hpText = document.getElementById('hp-text');
const rankDisplay = document.getElementById('rank-display');
const comboDisplay = document.getElementById('combo-display');
const receptionistComment = document.getElementById('receptionist-comment');
const vignetteOverlay = document.getElementById('vignette-overlay');
const guildContainer = document.querySelector('.guild-container');

const gambleModal = document.getElementById('gamble-modal');
const gambleTitle = document.getElementById('gamble-title');
const gambleDetails = document.getElementById('gamble-details');
const gambleRewardHint = document.getElementById('gamble-reward-hint');
const gambleAcceptBtn = document.getElementById('gamble-accept-btn');
const gambleCancelBtn = document.getElementById('gamble-cancel-btn');

const gameoverModal = document.getElementById('gameover-modal');
const gameoverTitle = document.getElementById('gameover-title');
const gameoverMessage = document.getElementById('gameover-message');
const finalRankDisplay = document.getElementById('final-rank-display');
const achievementTitleDisplay = document.getElementById('achievement-title-display');
const bestQuestDisplay = document.getElementById('best-quest-display');
const worstQuestDisplay = document.getElementById('worst-quest-display');
const rankingComparisonDisplay = document.getElementById('ranking-comparison-display');
const restartBtn = document.getElementById('restart-btn');

// ===== ゲーム状態（保存なし・リロードで完全初期化） =====
const MAX_HP = 100;
const GAMBLE_HP_THRESHOLD = 25; // このHP%以下でギャンブルボタン出現
const REFERENCE_SCORE = 200;    // 「歴代平均」演出用の固定値

let state = {
    name: "",
    hp: MAX_HP,
    score: 0,
    questsCompleted: 0,
    combo: 0,
    maxCombo: 0,
    lastAcceptedTitle: "",
    history: [],          // { title, category, type, hpCost, rewardValue, ratio }
    gambleWon: false,
    gambleLost: false
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

function getDifficultyTag(difficulty) {
    if (difficulty >= 9) return "【自殺行為】";
    if (difficulty >= 7) return "【超高難度】";
    if (difficulty >= 5) return "【高難度】";
    if (difficulty >= 3) return "【緊急】";
    return "【お使い】";
}

// ===== サウンド（Web Audio APIで生成、外部ファイル不要） =====
let audioCtx = null;
function ensureAudio() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    return audioCtx;
}
function playTone(freq, duration, type = 'sine', volume = 0.15, delay = 0) {
    try {
        const ctx = ensureAudio();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = type;
        osc.frequency.value = freq;
        gain.gain.value = volume;
        osc.connect(gain);
        gain.connect(ctx.destination);
        const startTime = ctx.currentTime + delay;
        osc.start(startTime);
        gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
        osc.stop(startTime + duration);
    } catch (e) {
        // 音が鳴らせない環境でもゲームは続行
    }
}
function playGenerateSound() {
    playTone(660, 0.08, 'square', 0.08);
    playTone(880, 0.08, 'square', 0.08, 0.08);
}
function playAcceptSound() {
    playTone(440, 0.12, 'triangle', 0.15);
    playTone(660, 0.15, 'triangle', 0.12, 0.1);
}
function playRecoverySound() {
    playTone(523, 0.15, 'sine', 0.15);
    playTone(659, 0.15, 'sine', 0.15, 0.12);
    playTone(784, 0.2, 'sine', 0.15, 0.24);
}
function playGambleWinSound() {
    [523, 659, 784, 1046].forEach((f, i) => playTone(f, 0.15, 'sawtooth', 0.12, i * 0.1));
}
function playGambleLoseSound() {
    playTone(200, 0.4, 'sawtooth', 0.2);
    playTone(120, 0.6, 'sawtooth', 0.2, 0.2);
}
function playGameOverSound() {
    playTone(196, 0.5, 'sine', 0.2);
    playTone(147, 0.8, 'sine', 0.2, 0.3);
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

// ===== 受付嬢のセリフ =====
function updateReceptionistComment() {
    const hpPercent = (state.hp / MAX_HP) * 100;
    let comment = "「今日はどんな依頼を受けますか？」";
    if (hpPercent <= 0) {
        comment = "「……嘘でしょう？」";
    } else if (hpPercent <= 20) {
        comment = "「お願いですから、もうやめてください…」";
    } else if (hpPercent <= 40) {
        comment = "「本当に大丈夫ですか…？無理しないでくださいね」";
    } else if (hpPercent <= 70) {
        comment = "「少し顔色が悪いですけど、大丈夫ですか？」";
    } else {
        comment = "「まだまだいけますね！次の依頼はいかがです？」";
    }
    receptionistComment.innerText = comment;
}

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
    comboDisplay.innerText = state.combo;

    // 画面演出：HPが減るほど赤いビネットが濃くなる
    const vignetteOpacity = Math.max(0, (70 - hpPercent) / 70) * 0.6;
    vignetteOverlay.style.opacity = vignetteOpacity.toFixed(2);

    // HPが危険域なら画面を揺らす
    if (hpPercent > 0 && hpPercent <= 20) {
        guildContainer.classList.add('critical-shake');
    } else {
        guildContainer.classList.remove('critical-shake');
    }

    // 一発逆転クエストボタンの表示切替
    if (hpPercent > 0 && hpPercent <= GAMBLE_HP_THRESHOLD) {
        gambleBtn.classList.remove('hidden');
    } else {
        gambleBtn.classList.add('hidden');
    }

    updateReceptionistComment();
}

// ===== クエスト生成（3件まとめて） =====
generateBtn.addEventListener('click', async () => {
    playGenerateSound();
    generateBtn.innerText = "ギルドマスターに申請中...";
    generateBtn.disabled = true;

    try {
        const previousTitle = encodeURIComponent(state.lastAcceptedTitle || "");
        const requests = [1, 2, 3].map(() =>
            fetch(`/api/generate-quest?previousTitle=${previousTitle}`).then(r => r.json())
        );
        const quests = await Promise.all(requests);

        if (emptyBoardMessage) {
            emptyBoardMessage.remove();
        }

        quests.forEach(quest => {
            if (quest.error) {
                console.error(quest.error);
                return;
            }
            const card = buildQuestCard(quest);
            questList.insertBefore(card, questList.firstChild);
        });

    } catch (error) {
        alert("通信エラー：ギルドの伝書鳩が撃ち落とされました。");
    } finally {
        generateBtn.innerText = "GENERATE UNREASONABLE QUEST";
        generateBtn.disabled = false;
    }
});

// ===== クエストカードを組み立てる =====
function buildQuestCard(quest) {
    const card = document.createElement('div');
    card.className = 'quest-card';
    card.dataset.type = quest.type;

    if (quest.type === 'recovery') {
        card.dataset.healAmount = quest.healAmount;
        card.innerHTML = `
            <div class="quest-tag cat-回復">【回復依頼】</div>
            <h3 class="quest-title">${quest.title}</h3>
            <p class="quest-details"><strong>詳細:</strong> ${quest.details}</p>
            <p class="quest-reward"><strong>報酬:</strong> ${quest.reward}</p>
            <div class="quest-meta">
                <span class="meta-hp">体力回復: ？？？</span>
                <span class="meta-value">-</span>
            </div>
            <button class="order-btn">受注する（血の契約）</button>
        `;
    } else {
        card.dataset.hpCost = quest.hpCost;
        card.dataset.rewardValue = quest.rewardValue;
        card.innerHTML = `
            <div class="quest-tag cat-${quest.category}">${getDifficultyTag(quest.difficulty)}［${quest.category}］</div>
            <h3 class="quest-title">${quest.title}</h3>
            <p class="quest-details"><strong>詳細:</strong> ${quest.details}</p>
            <p class="quest-reward"><strong>報酬:</strong> ${quest.reward}</p>
            <div class="quest-meta">
                <span class="meta-hp">体力消費: ${quest.hpCost}</span>
                <span class="meta-value">価値: ？？？pt</span>
            </div>
            <button class="order-btn">受注する（血の契約）</button>
        `;
    }

    const orderBtn = card.querySelector('.order-btn');
    initFleeButton(orderBtn);
    orderBtn.addEventListener('click', () => acceptQuest(card, quest));

    return card;
}

// ===== 通常/回復クエスト受注処理 =====
function acceptQuest(card, quest) {
    if (state.hp <= 0) return;

    if (quest.type === 'recovery') {
        const healAmount = Number(card.dataset.healAmount) || 15;
        state.hp = Math.min(MAX_HP, state.hp + healAmount);
        state.lastAcceptedTitle = quest.title;
        state.history.push({ title: quest.title, category: '回復', type: 'recovery', hpCost: 0, rewardValue: 0, ratio: null });

        const valueSpan = card.querySelector('.meta-value');
        const hpSpan = card.querySelector('.meta-hp');
        hpSpan.innerText = `体力回復: +${healAmount}`;
        valueSpan.innerText = "";

        playRecoverySound();
        card.classList.add('accepted');
        updateStatusBar();
        return;
    }

    const hpCost = Number(card.dataset.hpCost) || 10;
    const baseReward = Number(card.dataset.rewardValue) || 5;
    const ratio = baseReward / hpCost;

    // コンボボーナス：連続受注でスコア倍率アップ（最大+50%）
    const comboMultiplier = 1 + Math.min(state.combo, 10) * 0.05;
    const finalReward = Math.round(baseReward * comboMultiplier);

    state.hp -= hpCost;
    state.score += finalReward;
    state.questsCompleted += 1;
    state.lastAcceptedTitle = quest.title;

    // ハズレを引くとコンボが切れる、それ以外は伸びる
    if (ratio <= 0.3) {
        state.combo = 0;
    } else {
        state.combo += 1;
        state.maxCombo = Math.max(state.maxCombo, state.combo);
    }

    state.history.push({
        title: quest.title,
        category: quest.category,
        type: 'normal',
        hpCost,
        rewardValue: baseReward,
        ratio
    });

    // 受注した瞬間にポイントを公開
    const valueSpan = card.querySelector('.meta-value');
    let revealText = `獲得ポイント: ${finalReward}pt`;
    if (comboMultiplier > 1) {
        revealText += `（コンボ+${Math.round((comboMultiplier - 1) * 100)}%）`;
    }
    valueSpan.innerText = revealText;
    valueSpan.classList.add('revealed');

    let comment = '';
    let commentClass = '';
    if (ratio >= 1.2) {
        comment = '大当たり！';
        commentClass = 'result-great';
    } else if (ratio <= 0.3) {
        comment = 'ハズレ…';
        commentClass = 'result-bad';
    }
    if (comment) {
        const commentEl = document.createElement('span');
        commentEl.className = `result-comment ${commentClass}`;
        commentEl.innerText = comment;
        valueSpan.appendChild(commentEl);
    }

    playAcceptSound();
    card.classList.add('accepted');
    updateStatusBar();

    if (state.hp <= 0) {
        triggerGameOver(false);
    }
}

// ===== 一発逆転クエスト =====
let currentGambleQuest = null;

gambleBtn.addEventListener('click', async () => {
    gambleBtn.disabled = true;
    gambleBtn.innerText = "探索中...";
    try {
        const response = await fetch('/api/generate-quest?type=gamble');
        const quest = await response.json();
        if (quest.error) {
            alert(`エラー: ${quest.error}`);
            return;
        }
        currentGambleQuest = quest;
        gambleTitle.innerText = quest.title;
        gambleDetails.innerText = quest.details;
        gambleRewardHint.innerText = `成功報酬: ${quest.gambleReward}pt（${quest.reward}）`;
        gambleModal.classList.remove('hidden');
    } catch (e) {
        alert("通信エラー：ギルドの伝書鳩が撃ち落とされました。");
    } finally {
        gambleBtn.disabled = false;
        gambleBtn.innerText = "⚠️ 一発逆転クエストを探す";
    }
});

gambleCancelBtn.addEventListener('click', () => {
    gambleModal.classList.add('hidden');
    currentGambleQuest = null;
});

gambleAcceptBtn.addEventListener('click', () => {
    if (!currentGambleQuest) return;

    const won = Math.random() < 0.5;
    gambleModal.classList.add('hidden');

    if (won) {
        state.gambleWon = true;
        state.score += currentGambleQuest.gambleReward;
        state.hp = Math.max(state.hp, 10); // 九死に一生
        state.history.push({
            title: currentGambleQuest.title,
            category: '賭け',
            type: 'gamble-win',
            hpCost: 0,
            rewardValue: currentGambleQuest.gambleReward,
            ratio: null
        });
        playGambleWinSound();
        alert(`大逆転成功！「${currentGambleQuest.title}」で${currentGambleQuest.gambleReward}ptを獲得！`);
        updateStatusBar();
    } else {
        state.gambleLost = true;
        state.hp = 0;
        playGambleLoseSound();
        updateStatusBar();
        triggerGameOver(true);
    }

    currentGambleQuest = null;
});

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

// ===== 称号システム =====
function getAchievementTitle() {
    if (state.gambleWon) return "一発屋（伝説の博打打ち）";
    if (state.gambleLost) return "無謀な挑戦者（安らかに）";

    const normalHistory = state.history.filter(h => h.type === 'normal');
    const hazureCount = normalHistory.filter(h => h.ratio <= 0.3).length;
    const atariCount = normalHistory.filter(h => h.ratio >= 1.2).length;
    const recoveryCount = state.history.filter(h => h.type === 'recovery').length;

    if (hazureCount >= 5) return "ハズレ王";
    if (atariCount >= 5) return "掘り出し物ハンター";
    if (state.maxCombo >= 8) return "コンボマスター";
    if (recoveryCount >= 3) return "休憩上手";
    if (state.questsCompleted <= 2) return "早すぎる撤退";
    return "堅実な冒険者";
}

// ===== 歴代平均との比較演出 =====
function getRankingComparisonText() {
    const diff = state.score - REFERENCE_SCORE;
    if (diff >= 50) return `歴代平均を${diff}pt上回る好成績！`;
    if (diff > 0) return `僅かに歴代平均を上回りました。`;
    if (diff === 0) return `ちょうど歴代平均と同じでした。`;
    return `歴代平均を${Math.abs(diff)}pt下回りました…`;
}

// ===== ゲームオーバー処理 =====
function triggerGameOver(isGambleDeath) {
    generateBtn.disabled = true;
    gambleBtn.disabled = true;
    gambleBtn.classList.add('hidden');
    document.querySelectorAll('.order-btn').forEach(btn => btn.disabled = true);

    playGameOverSound();

    gameoverTitle.innerText = isGambleDeath ? "賭けに敗れました…" : "力尽きました…";
    gameoverMessage.innerText =
        `${state.name}は${state.questsCompleted}件のクエストをこなし、${isGambleDeath ? "一発逆転クエストに敗れて" : ""}力尽きました。`;
    finalRankDisplay.innerText = `最終ギルドランク：${getRankLabel(state.score)}（${state.score}pt）`;
    achievementTitleDisplay.innerText = `称号：${getAchievementTitle()}`;

    const normalHistory = state.history.filter(h => h.type === 'normal');
    if (normalHistory.length > 0) {
        const best = normalHistory.reduce((a, b) => (b.ratio > a.ratio ? b : a));
        const worst = normalHistory.reduce((a, b) => (b.ratio < a.ratio ? b : a));
        bestQuestDisplay.innerText = `🏆 ベスト依頼：「${best.title}」（HP${best.hpCost} → ${best.rewardValue}pt）`;
        worstQuestDisplay.innerText = `💀 ワースト依頼：「${worst.title}」（HP${worst.hpCost} → ${worst.rewardValue}pt）`;
    } else {
        bestQuestDisplay.innerText = "";
        worstQuestDisplay.innerText = "";
    }

    rankingComparisonDisplay.innerText = getRankingComparisonText();

    gameoverModal.classList.remove('hidden');
}

// 初期表示
updateStatusBar();
