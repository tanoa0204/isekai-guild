export default async function handler(req, res) {
  // 1. GroqのAPIキーを環境変数（安全な金庫）から取り出す
  const apiKey = process.env.GROQ_API_KEY;

  // キーがない場合のエラー処理
  if (!apiKey) {
    return res.status(500).json({ error: "APIキーが設定されていません。" });
  }

  // 2. AIへの指示（プロンプト）。ここで理不尽さを定義します！
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
    // 3. Groq API（Llama 3モデル）を呼び出す
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "llama3-8b-8192", // 爆速で動くGroqのモデル
        response_format: { type: "json_object" }, // プログラムで扱いやすいJSON形式で出力させる
        messages: [
          { role: "system", content: prompt }
        ]
      })
    });

    // 4. AIから返ってきた結果を整理する
    const data = await response.json();
    const quest = JSON.parse(data.choices[0].message.content);

    // 5. 画面（フロントエンド）にクエスト情報を渡す
    res.status(200).json(quest);

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "クエストの生成に失敗しました。ギルドがパニックです。" });
  }
}
