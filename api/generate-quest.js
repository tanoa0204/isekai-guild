export default async function handler(req, res) {
  const apiKey = process.env.GROQ_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ error: "APIキーが設定されていません。" });
  }

  const prompt = `
    あなたは異世界ギルドの受付嬢です。
    冒険者に対して、最高にシュールで理不尽、かつ少し笑えるクエストを1つ生成してください。
    以下のJSONフォーマットで返してください。余計な文章は一切不要です。
    {
      "title": "クエスト名（例：魔王城のWi-Fiルーター再起動）",
      "details": "詳細・理不尽な条件（例：ただしルーターはドラゴンの巣の奥にあります）",
      "reward": "報酬（例：使用済みティッシュ3枚）"
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
        model: "llama-3.1-8b-instant", // ← llama3-8b-8192 は廃止済みなので変更
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: prompt }
        ]
      })
    });

    const data = await response.json();

    // Groq側がエラーを返した場合はここで検知する
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

    res.status(200).json(quest);

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "クエストの生成に失敗しました。ギルドがパニックです。" });
  }
}
