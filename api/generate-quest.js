export default async function handler(req, res) {
  const apiKey = process.env.GROQ_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ error: "APIキーが設定されていません。" });
  }

  const prompt = `
    あなたは異世界ギルドの受付嬢です。
    冒険者に対して、シュールで理不尽、かつ少し笑えるクエストを1つ生成してください。

    【難易度の決め方（重要）】
    difficulty（1〜10の整数）は、以下の確率分布に従って決めてください。
    - 50%の確率で 1〜3（簡単なお使い程度）
    - 35%の確率で 4〜6（それなりに面倒）
    - 15%の確率で 7〜10（かなり過酷・理不尽）
    つまり基本的には簡単なクエストが多く、たまに高難度のクエストが混ざるようにしてください。
    高難度クエストばかりにならないよう注意してください。

    【ギャップ演出（重要）】
    以下のパターンをランダムに混ぜて、内容とリターンにギャップを作ってください。
    - パターンA（普通）: 難易度相応の内容・見た目で、hpCostとrewardValueも相応。
    - パターンB（当たり）: 一見すごく簡単・地味なクエストに見えるが、実はrewardValueが高い（掘り出し物）。
    - パターンC（ハズレ）: 一見大変そうな内容に見えるが、rewardValueが理不尽に低い。
    - パターンAを50%、パターンBを25%、パターンCを25%くらいの頻度で使ってください。

    【数値の決め方】
    - hpCost（体力消費、1〜40の整数）: difficultyにゆるく比例させる。目安は difficulty×2〜4程度。ただし難易度が低くても稀にhpCostが高い理不尽クエスト（拘束時間が長いだけ等）があってもよい。
    - rewardValue（報酬価値、1〜40の整数）: 上記のギャップ演出パターンに従って決める。hpCostと機械的に比例させないこと。

    以下のJSONフォーマットで返してください。余計な文章は一切不要です。数値は数値型で返してください。
    {
      "title": "クエスト名（例：隣町までの回覧板を届ける）",
      "details": "詳細・理不尽な条件（例：ただし隣町は光の速さで移動しても3日かかる距離にあります）",
      "reward": "報酬の説明文（例：ギルドマスターの気まぐれで金貨10枚）",
      "difficulty": 2,
      "hpCost": 5,
      "rewardValue": 30
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
        // 出力にランダム性を持たせて、分布指示が偏りすぎないようにする
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

    // AIが分布指示を無視して高難度ばかり返す場合に備えた保険（フォールバック時のみ使用）
    const fallbackDifficultyRoll = Math.random();
    const fallbackDifficulty = fallbackDifficultyRoll < 0.5
      ? Math.floor(Math.random() * 3) + 1   // 1-3
      : fallbackDifficultyRoll < 0.85
        ? Math.floor(Math.random() * 3) + 4 // 4-6
        : Math.floor(Math.random() * 4) + 7; // 7-10

    const difficulty = clamp(quest.difficulty, 1, 10, fallbackDifficulty);
    const hpCost = clamp(quest.hpCost, 1, 40, Math.max(1, difficulty * 3));
    const rewardValue = clamp(quest.rewardValue, 1, 40, Math.max(1, Math.floor(hpCost / 2)));

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
