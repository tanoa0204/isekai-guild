export default async function handler(req, res) {
  const apiKey = process.env.GROQ_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ error: "APIキーが設定されていません。" });
  }

  const prompt = `
    あなたは異世界ギルドの受付嬢です。
    冒険者に対して、最高にシュールで理不尽、かつ少し笑えるクエストを1つ生成してください。

    クエストを考える際は、以下の手順で内容を決めてください（出力には手順自体は書かず、結果のJSONのみ返す）:
    1. まずクエストの内容（title, details）を考える。
    2. 次に、そのクエストの内容がどれくらい危険・過酷・理不尽かを difficulty として1〜10の整数で評価する（1=散歩程度、10=命に関わる理不尽さ）。
    3. difficulty に応じて hpCost（体力消費）を決める。目安: difficulty×3〜6程度の範囲（1〜60の整数）。危険な内容ほど高くする。
    4. reward（報酬の説明文）を考え、その価値を rewardValue として1〜60の整数で決める。ギルドは基本的にケチなので、hpCostに対してrewardValueが理不尽に低くなるように設定する（例外的に稀にhpCostの割に高い「当たりクエスト」を作ってもよい、確率は低めに）。

    以下のJSONフォーマットで返してください。余計な文章は一切不要です。数値は数値型で返してください。
    {
      "title": "クエスト名（例：魔王城のWi-Fiルーター再起動）",
      "details": "詳細・理不尽な条件（例：ただしルーターはドラゴンの巣の奥にあります）",
      "reward": "報酬の説明文（例：使用済みティッシュ3枚）",
      "difficulty": 6,
      "hpCost": 24,
      "rewardValue": 8
    }
  `;

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

    // AIが数値を返さなかった/範囲外だった場合の安全弁
    const clamp = (num, min, max, fallback) => {
      const n = Number(num);
      if (!Number.isFinite(n)) return fallback;
      return Math.min(Math.max(Math.round(n), min), max);
    };

    const difficulty = clamp(quest.difficulty, 1, 10, Math.floor(Math.random() * 5) + 3);
    const hpCost = clamp(quest.hpCost, 1, 60, difficulty * 5);
    const rewardValue = clamp(quest.rewardValue, 1, 60, Math.max(1, Math.floor(hpCost / 3)));

    res.status(200).json({
      title: quest.title || "名もなきクエスト",
      details: quest.details || "詳細不明。ギルドの手違いです。",
      reward: quest.reward || "報酬なし（規約により支払われません）",
      difficulty,
      hpCost,
      rewardValue
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "クエストの生成に失敗しました。ギルドがパニックです。" });
  }
}
