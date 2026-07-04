export default async function handler(req, res) {
  const apiKey = process.env.GROQ_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ error: "APIキーが設定されていません。" });
  }

  const requestedType = req.query.type;
  const previousTitle = typeof req.query.previousTitle === 'string'
    ? req.query.previousTitle.slice(0, 100)
    : '';

  // タイプ決定：gambleは明示リクエストのみ。それ以外は5%で回復、95%で通常
  let type;
  if (requestedType === 'gamble') {
    type = 'gamble';
  } else {
    type = Math.random() < 0.05 ? 'recovery' : 'normal';
  }

  let prompt = '';

  if (type === 'recovery') {
    prompt = `
      あなたは異世界ギルドの受付嬢です。
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
  } else {
    prompt = `
      あなたは異世界ギルドの受付嬢です。
      冒険者に対して、シュールで理不尽、かつ少し笑えるクエストを1つ生成してください。
      ${previousTitle ? `直前に冒険者は「${previousTitle}」という依頼をこなしています。自然であれば後日談や関連性を匂わせてもよいです（無理にこじつけなくてよい）。` : ''}

      【カテゴリ】
      category は "戦闘", "雑用", "交渉" のいずれかにしてください。内容に合わせて選んでください。

      【難易度の決め方（重要）】
      difficulty（1〜10の整数）は以下の確率分布に従ってください。
      - 50%: 1〜3（簡単なお使い程度）
      - 35%: 4〜6（それなりに面倒）
      - 15%: 7〜10（かなり過酷・理不尽）
      基本的には簡単なクエストが多く、たまに高難度が混ざるようにしてください。

      【ギャップ演出（重要）】
      以下をランダムに混ぜて、内容とリターンにギャップを作ってください。
      - パターンA（普通、50%）: 難易度相応の内容・見た目で、hpCostとrewardValueも相応。
      - パターンB（当たり、25%）: 一見簡単・地味に見えるが、実はrewardValueが高い。
      - パターンC（ハズレ、25%）: 一見大変そうに見えるが、rewardValueが理不尽に低い。

      【数値の決め方】
      - hpCost（1〜40の整数）: difficulty×2〜4程度が目安。低難度でも稀にhpCostが高い理不尽クエストがあってもよい。
      - rewardValue（1〜40の整数）: ギャップ演出パターンに従う。hpCostと機械的に比例させないこと。

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
        healAmount
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
        gambleReward
      });
    }

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

    res.status(200).json({
      type: 'normal',
      title: quest.title || "名もなきクエスト",
      details: quest.details || "詳細不明。ギルドの手違いです。",
      reward: quest.reward || "報酬なし（規約により支払われません）",
      category,
      difficulty,
      hpCost,
      rewardValue
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "クエストの生成に失敗しました。ギルドがパニックです。" });
  }
}
