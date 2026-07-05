export default async function handler(req, res) {
  const apiKey = process.env.GROQ_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ error: "APIキーが設定されていません。" });
  }

  const params = req.method === 'POST' ? (req.body || {}) : (req.query || {});

  const requestedType = params.type;
  const previousTitle = typeof params.previousTitle === 'string' ? params.previousTitle.slice(0, 100) : '';
  const storyEligible = params.storyEligible === '1' || params.storyEligible === 1;

  const WORLD_LORE = `
    この物語の舞台は、辺境の異世界「クロニクル辺境」。
    かつて人間と魔王軍は激しく争っていたが、ある時を境に魔王が「もう戦うのは面倒くさい」と言い出し、
    以来、魔王軍と人間側の揉め事はすべて冒険者ギルドが仲介する"事務処理"として扱われるようになった。
    冒険者ギルドの受付嬢は、来る日も来る日も魔王軍や近隣の奇妙な種族、時にはギルドマスター自身からの
    理不尽な依頼をさばき続けている。受付嬢自身も、なぜ自分がこんな場所で働いているのか、
    本当のところはよくわかっていない。
  `;

  // ===== アイテム関連のヘルパー =====
  const RARITY_WEIGHTS = { common: 50, uncommon: 30, rare: 15, epic: 4, legendary: 1 };
  function pickWeightedRarity() {
    const total = Object.values(RARITY_WEIGHTS).reduce((a, b) => a + b, 0);
    let r = Math.random() * total;
    for (const [rarity, weight] of Object.entries(RARITY_WEIGHTS)) {
      if (r < weight) return rarity;
      r -= weight;
    }
    return 'common';
  }

  function buildItemInstruction(forceLegendary) {
    if (forceLegendary) {
      return `
        【重要】この依頼はストーリーの最終章です。報酬として、必ず記念になるような特別なアイテムを1つ生成してください。
        - itemRarityは "legendary" 固定にしてください。
        - itemEffectTypeは "heal"（体力回復）, "luck"（次の依頼の運が上がる）, "decorative"（見た目重視・効果なし）のいずれかにしてください。
        - itemEffectValueは、healなら20〜40、luckなら20〜50、decorativeなら0にしてください。
        JSONに必ず以下のキーを追加してください（省略不可）:
        "itemName": "アイテム名（伝説的で思い出に残る名前）",
        "itemDescription": "アイテムの説明（この物語にまつわる思い出深いもの）",
        "itemRarity": "legendary",
        "itemEffectType": "heal",
        "itemEffectValue": 30
      `;
    }
    return `
      このクエストでは、25%程度の確率で報酬として副次的なアイテムが手に入ったことにしてください。
      アイテムを出す場合のみ、JSONに以下のキーを追加してください（出さない場合はこれらのキー自体を書かないでください）:
      "itemName": "アイテム名（ユニークで少し笑えるもの）",
      "itemDescription": "アイテムの説明・効果のフレーバーテキスト",
      "itemRarity": "common・uncommon・rare・epicのいずれか（epicはごく稀）",
      "itemEffectType": "heal・luck・decorativeのいずれか",
      "itemEffectValue": "数値（heal:5〜25, luck:10〜30, decorative:0）"
    `;
  }

  function parseItemFromQuest(quest, forceLegendary) {
    if (!forceLegendary && !quest.itemName) return null;

    const validRarities = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
    const rarity = validRarities.includes(quest.itemRarity)
      ? quest.itemRarity
      : (forceLegendary ? 'legendary' : pickWeightedRarity());

    const validEffects = ['heal', 'luck', 'decorative'];
    const effectType = validEffects.includes(quest.itemEffectType) ? quest.itemEffectType : 'decorative';

    let effectValue = Number(quest.itemEffectValue);
    if (!Number.isFinite(effectValue)) {
      effectValue = effectType === 'heal' ? (forceLegendary ? 30 : 15)
        : effectType === 'luck' ? (forceLegendary ? 35 : 20)
        : 0;
    } else if (effectType === 'heal') {
      effectValue = Math.min(Math.max(Math.round(effectValue), 5), 40);
    } else if (effectType === 'luck') {
      effectValue = Math.min(Math.max(Math.round(effectValue), 10), 50);
    } else {
      effectValue = 0;
    }

    return {
      name: quest.itemName || (forceLegendary ? '名もなき記念品' : '奇妙な小物'),
      description: quest.itemDescription || 'よくわからないが、なんとなく手元に残った。',
      rarity,
      effectType,
      effectValue
    };
  }

  // タイプ決定
  let type;
  if (requestedType === 'gamble') {
    type = 'gamble';
  } else if (requestedType === 'story_new') {
    type = 'story_new';
  } else if (requestedType === 'story_continue') {
    type = 'story_continue';
  } else {
    const roll = Math.random();
    if (roll < 0.05) {
      type = 'recovery';
    } else if (storyEligible && roll < 0.17) {
      type = 'story_new';
    } else {
      type = 'normal';
    }
  }

  let prompt = '';
  let forceFinalChapter = false;

  if (type === 'recovery') {
    prompt = `
      あなたは異世界ギルドの受付嬢です。
      ${WORLD_LORE}
      冒険者が体力を回復できる、ほのぼの・脱力系の「休憩クエスト」を1つ生成してください（レアな依頼という設定です）。
      内容はシュールで少し笑える程度にし、危険な要素は含めないでください。

      以下のJSONフォーマットで返してください。余計な文章は一切不要です。数値は数値型で返してください。
      {
        "title": "クエスト名（例：ギルド食堂の裏メニューを味わう）",
        "details": "詳細（例：店主の気まぐれで出てくるので何が出るかは運次第）",
        "reward": "報酬の説明文（例：満腹感と少しの元気）",
        "healAmount": 20
      }
      healAmountは5〜30の整数にしてください。
    `;
  } else if (type === 'gamble') {
    prompt = `
      あなたは異世界ギルドの受付嬢です。
      ${WORLD_LORE}
      冒険者が虫の息の状態で受けるかどうか迷うような、超ハイリスク・ハイリターンな「一発逆転クエスト」を1つ生成してください。
      内容は理不尽かつ緊張感のある、シュールな文体にしてください。

      以下のJSONフォーマットで返してください。余計な文章は一切不要です。数値は数値型で返してください。
      {
        "title": "クエスト名（例：竜の逆鱗を試しに触ってみる）",
        "details": "詳細（例：成功すれば伝説、失敗すれば伝説になれない）",
        "reward": "成功時の報酬の説明文（例：ドラゴンの財宝の一部）",
        "gambleReward": 100
      }
      gambleRewardは60〜150の整数にしてください。
    `;
  } else if (type === 'story_new') {
    prompt = `
      あなたは異世界ギルドの受付嬢です。以下の世界観に基づいて、
      通常の理不尽クエストとは別に「物語性のある特別な依頼」の第1章を作成してください。

      【世界観】
      ${WORLD_LORE}

      この依頼は今後5章にわたって続く長編クエストの序章です。
      - 受付嬢の過去、魔王の真意、消えた冒険者の噂など、気になる伏線や謎を感じさせる内容にしてください。
      - シュールで少し笑える要素も残してください（重すぎる真面目な話にはしない）。
      - 体力消費(hpCost)と報酬価値(rewardValue)を設定してください（1〜40の整数）。

      ${buildItemInstruction(false)}

      以下のJSON形式で返してください。余計な文章は不要です。数値は数値型で返してください。
      {
        "arcTitle": "物語全体のタイトル（例：受付嬢の失われた記憶）",
        "chapterTitle": "第1章のクエスト名",
        "details": "詳細・理不尽な条件",
        "reward": "報酬の説明文",
        "hpCost": 10,
        "rewardValue": 15
      }
    `;
  } else if (type === 'story_continue') {
    const arcTitle = typeof params.arcTitle === 'string' ? params.arcTitle.slice(0, 100) : '名もなき物語';
    const chapters = Array.isArray(params.chapters) ? params.chapters : [];
    const nextChapterNumber = chapters.length + 1;
    forceFinalChapter = nextChapterNumber >= 5;

    const summary = chapters
      .map(c => `第${c.chapterNumber}章「${c.title}」: ${c.details}`)
      .join('\n');

    prompt = `
      あなたは異世界ギルドの受付嬢です。以下の世界観のもとで進行中の連続クエスト「${arcTitle}」の続きの章を作成してください。

      【世界観】
      ${WORLD_LORE}

      【これまでのあらすじ】
      ${summary || '（まだ第1章のみです）'}

      これは第${nextChapterNumber}章です。
      ${forceFinalChapter
        ? '【重要】これは最終章（第5章）です。物語をきちんと完結させてください。isFinalは必ずtrueにしてください。'
        : 'まだ物語は続きます。isFinalはfalseにしてください。'}
      体力消費(hpCost)と報酬価値(rewardValue)を設定してください（1〜40の整数）。

      ${buildItemInstruction(forceFinalChapter)}

      以下のJSON形式で返してください。余計な文章は不要です。数値は数値型で返してください。
      {
        "chapterTitle": "この章のクエスト名",
        "details": "詳細・理不尽な条件、または物語の展開",
        "reward": "報酬の説明文",
        "hpCost": 12,
        "rewardValue": 18,
        "isFinal": ${forceFinalChapter ? 'true' : 'false'}
      }
    `;
  } else {
    prompt = `
      あなたは異世界ギルドの受付嬢です。
      ${WORLD_LORE}
      冒険者に対して、シュールで理不尽、かつ少し笑えるクエストを1つ生成してください。
      ${previousTitle ? `直前に冒険者は「${previousTitle}」という依頼をこなしています。自然であれば後日談や関連性を匂わせてもよいです（無理にこじつけなくてよい）。` : ''}

      【カテゴリ】
      category は "戦闘", "雑用", "交渉" のいずれかにしてください。内容に合わせて選んでください。

      【難易度の決め方（重要）】
      difficulty（1〜10の整数）は以下の確率分布に従ってください。
      - 50%: 1〜3（簡単なお使い程度）
      - 35%: 4〜6（それなりに面倒）
      - 15%: 7〜10（かなり過酷・理不尽）

      【ギャップ演出（重要）】
      - パターンA（普通、50%）: 難易度相応の内容・見た目で、hpCostとrewardValueも相応。
      - パターンB（当たり、25%）: 一見簡単・地味に見えるが、実はrewardValueが高い。
      - パターンC（ハズレ、25%）: 一見大変そうに見えるが、rewardValueが理不尽に低い。

      【数値の決め方】
      - hpCost（1〜40の整数）: difficulty×2〜4程度が目安。
      - rewardValue（1〜40の整数）: ギャップ演出パターンに従う。

      ${buildItemInstruction(false)}

      以下のJSONフォーマットで返してください。余計な文章は一切不要です。数値は数値型で返してください。
      {
        "title": "クエスト名",
        "details": "詳細・理不尽な条件",
        "reward": "報酬の説明文",
        "category": "雑用",
        "difficulty": 2,
        "hpCost": 5,
        "rewardValue": 30
      }
    `;
  }

  try {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "llama-3.1-8b-instant",
        response_format: { type: "json_object" },
        temperature: 1.0,
        messages: [
          { role: "system", content: prompt }
        ]
      })
    });

    const data = await response.json();

    if (!response.ok || data.error) {
      console.error("Groq API error:", data);
      return res.status(502).json({
        error: "AIとの通信でエラーが発生しました。",
        detail: data.error?.message || "unknown error"
      });
    }

    let quest;
    try {
      quest = JSON.parse(data.choices[0].message.content);
    } catch (parseErr) {
      console.error("JSON parse error:", data.choices?.[0]?.message?.content);
      return res.status(500).json({ error: "AIの返答をJSONとして解釈できませんでした。" });
    }

    const clamp = (num, min, max, fallback) => {
      const n = Number(num);
      if (!Number.isFinite(n)) return fallback;
      return Math.min(Math.max(Math.round(n), min), max);
    };

    if (type === 'recovery') {
      const healAmount = clamp(quest.healAmount, 5, 30, 15);
      return res.status(200).json({
        type: 'recovery',
        title: quest.title || "ギルド食堂の裏メニューを味わう",
        details: quest.details || "詳細不明。とりあえず美味しかった。",
        reward: quest.reward || "満腹感",
        category: "回復",
        healAmount,
        item: null
      });
    }

    if (type === 'gamble') {
      const gambleReward = clamp(quest.gambleReward, 60, 150, 100);
      return res.status(200).json({
        type: 'gamble',
        title: quest.title || "名もなき一発逆転クエスト",
        details: quest.details || "詳細不明。とにかく命懸けです。",
        reward: quest.reward || "成功すれば大金",
        category: "賭け",
        gambleReward,
        item: null
      });
    }

    if (type === 'story_new') {
      const hpCost = clamp(quest.hpCost, 1, 40, 10);
      const rewardValue = clamp(quest.rewardValue, 1, 40, 15);
      const item = parseItemFromQuest(quest, false);
      return res.status(200).json({
        type: 'story_new',
        arcTitle: quest.arcTitle || "名もなき物語",
        chapterTitle: quest.chapterTitle || "第1章：奇妙な依頼",
        details: quest.details || "詳細不明。",
        reward: quest.reward || "報酬なし",
        hpCost,
        rewardValue,
        item
      });
    }

    if (type === 'story_continue') {
      const hpCost = clamp(quest.hpCost, 1, 40, 12);
      const rewardValue = clamp(quest.rewardValue, 1, 40, 18);
      const isFinal = forceFinalChapter ? true : (quest.isFinal === true);
      const item = parseItemFromQuest(quest, forceFinalChapter);
      return res.status(200).json({
        type: 'story_continue',
        chapterTitle: quest.chapterTitle || "次の章",
        details: quest.details || "詳細不明。",
        reward: quest.reward || "報酬なし",
        hpCost,
        rewardValue,
        isFinal,
        item
      });
    }

    // normal
    const fallbackRoll = Math.random();
    const fallbackDifficulty = fallbackRoll < 0.5
      ? Math.floor(Math.random() * 3) + 1
      : fallbackRoll < 0.85
        ? Math.floor(Math.random() * 3) + 4
        : Math.floor(Math.random() * 4) + 7;

    const difficulty = clamp(quest.difficulty, 1, 10, fallbackDifficulty);
    const hpCost = clamp(quest.hpCost, 1, 40, Math.max(1, difficulty * 3));
    const rewardValue = clamp(quest.rewardValue, 1, 40, Math.max(1, Math.floor(hpCost / 2)));
    const category = ["戦闘", "雑用", "交渉"].includes(quest.category) ? quest.category : "雑用";
    const item = parseItemFromQuest(quest, false);

    res.status(200).json({
      type: 'normal',
      title: quest.title || "名もなきクエスト",
      details: quest.details || "詳細不明。ギルドの手違いです。",
      reward: quest.reward || "報酬なし（規約により支払われません）",
      category,
      difficulty,
      hpCost,
      rewardValue,
      item
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "クエストの生成に失敗しました。ギルドがパニックです。" });
  }
}
