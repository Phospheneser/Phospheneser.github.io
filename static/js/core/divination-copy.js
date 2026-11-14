// Shared by the widget and HTTP client, including their loading/error states.
const translations = {
  zh: {
    open: '打开占卜', close: '关闭占卜', title: '神秘占卜师', defaultQuery: '今日运势',
    query: '请输入您的问题：', mode: '选择占卜方式：',
    JiuGongLiuRen: '九宫六壬', LiuYaoQiGua: '六爻起卦', Tarot: '塔罗牌',
    ai: '附加 AI 解读（较慢）', submit: '开始占卜', submitting: '占卜中…',
    ready: '占卜服务已就绪', warming: '正在提前唤醒占卜服务，你可以先输入问题…',
    notReady: '暂未确认服务就绪，可以点击开始占卜重试。',
    queryRequired: '请先输入您的问题。', connecting: '正在连接占卜服务…',
    slow: '服务响应较慢，可能正在唤醒或生成解读，请稍候。可以关闭窗口取消等待。',
    invalidServer: '占卜服务地址无效，请检查服务配置。',
    httpError: '占卜服务暂时不可用（HTTP {status}），请稍后重试。',
    invalidResponse: '服务尚未返回有效结果，可能正在启动，请稍后重试。',
    failed: '服务未能完成本次占卜，请稍后重试或更换占卜方式。',
    interpretation: '卦象解读', aiUnavailable: 'AI 解读暂时不可用，以上为基础占卜结果。',
    timeout: '等待服务超时。服务可能正在唤醒或繁忙，请稍后重试。',
    networkError: '无法连接占卜服务，请检查网络或稍后重试。'
  },
  en: {
    open: 'Open divination', close: 'Close divination', title: 'Fortune Teller', defaultQuery: "Today's fortune",
    query: 'Enter your question:', mode: 'Choose a divination method:',
    JiuGongLiuRen: 'Nine-Palace Liu Ren', LiuYaoQiGua: 'Six-Line Divination', Tarot: 'Tarot',
    ai: 'Include AI interpretation (slower)', submit: 'Start divination', submitting: 'Divining…',
    ready: 'Divination service is ready', warming: 'Waking up the service. You can enter your question now…',
    notReady: 'The service is not ready yet. Start divination to try again.',
    queryRequired: 'Please enter your question first.', connecting: 'Connecting to the divination service…',
    slow: 'The service may be waking up or generating an interpretation. Please wait, or close this window to cancel.',
    invalidServer: 'The divination service address is invalid. Please check the configuration.',
    httpError: 'The divination service is temporarily unavailable (HTTP {status}). Please try again later.',
    invalidResponse: 'The service has not returned a valid result. It may be starting up; please try again.',
    failed: 'The service could not complete this reading. Please try again or choose another method.',
    interpretation: 'Interpretation', aiUnavailable: 'AI interpretation is temporarily unavailable. The basic reading is shown above.',
    timeout: 'The request timed out. The service may be waking up or busy; please try again.',
    networkError: 'Unable to connect to the divination service. Check your connection or try again later.'
  },
  jp: {
    open: '占いを開く', close: '占いを閉じる', title: '占い師', defaultQuery: '今日の運勢',
    query: '質問を入力してください：', mode: '占いの方法を選択：',
    JiuGongLiuRen: '九宮六壬', LiuYaoQiGua: '六爻占い', Tarot: 'タロット',
    ai: 'AI 解説を追加（時間がかかります）', submit: '占いを始める', submitting: '占い中…',
    ready: '占いサービスの準備ができました', warming: 'サービスを起動しています。先に質問を入力できます…',
    notReady: 'サービスの準備を確認できません。「占いを始める」で再試行できます。',
    queryRequired: '先に質問を入力してください。', connecting: '占いサービスに接続しています…',
    slow: 'サービスの起動または解説の生成に時間がかかっています。しばらくお待ちください。ウィンドウを閉じると中止できます。',
    invalidServer: '占いサービスのアドレスが無効です。設定を確認してください。',
    httpError: '占いサービスを一時的に利用できません（HTTP {status}）。後でもう一度お試しください。',
    invalidResponse: '有効な結果がまだ返されていません。サービスが起動中の可能性があります。再試行してください。',
    failed: '占いを完了できませんでした。再試行するか、別の方法を選択してください。',
    interpretation: '占いの解説', aiUnavailable: 'AI 解説を一時的に利用できません。上に基本の占い結果を表示しています。',
    timeout: '待機時間を超過しました。サービスが起動中または混雑している可能性があります。再試行してください。',
    networkError: '占いサービスに接続できません。ネットワークを確認するか、後でもう一度お試しください。'
  }
};
export const divinationCopy = language => translations[language === 'ja' ? 'jp' : language] || translations.en;
