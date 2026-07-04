export default async function handler(req, res) {
  const apiKey = process.env.GROQ_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ error: "APIキーが設定されていません。" });
  }

  const prompt = `
    あなたは異世界ギルドの受付嬢です。
    冒険者に対して、最高にシュールで理不尽、かつ少し笑えるクエストを1つ生成してください。
    このクエストには「体力消費量」と「報酬価値(ギルドポイント)」も設定してください。
    - hpCost: このクエストで消費する体力(1〜40の整数。理不尽さ・危険度に応じて決めてください)
    - rewardValue: このクエストの報酬価値(1〜40の整数。基本的にhpCostに見合わない、理不尽に低い値にしてください。稀に当たりも作ってOK)

    以下のJSONフォーマットで返してください。余計な文章は一切不要です。数値は数値型で返してください。
    {
      "title": "クエスト名（例：魔王城のWi-Fiルーター再起動）",
      "details": "詳細・理不尽な条件（例：ただしルーターはドラゴンの巣の奥にあります）",
      "reward": "報酬の説明文（例：使用済みティッシュ3枚）",
      "hpCost": 15,
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

    // AIが数値を返さなかった場合の安全弁（フォールバック）
    const hpCost = Number.isFinite(Number(quest.hpCost))
      ? Math.min(Math.max(Math.round(Number(quest.hpCost)), 1), 60)
      : Math.floor(Math.random() * 20) + 10;

    const rewardValue = Number.isFinite(Number(quest.rewardValue))
      ? Math.min(Math.max(Math.round(Number(quest.rewardValue)), 1), 60)
      : Math.floor(Math.random() * 20) + 5;

    res.status(200).json({
      title: quest.title || "名もなきクエスト",
      details: quest.details || "詳細不明。ギルドの手違いです。",
      reward: quest.reward || "報酬なし（規約により支払われません）",
      hpCost,
      rewardValue
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "クエストの生成に失敗しました。ギルドがパニックです。" });
  }
}
