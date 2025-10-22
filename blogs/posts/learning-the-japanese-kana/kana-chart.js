(function () {
    const target = document.getElementById("kana-section");
    if (!target) return;

    const ensureStyles = () => {
        const styleId = "kana-chart-style";
        if (document.getElementById(styleId)) return;
        const style = document.createElement("style");
        style.id = styleId;
        style.textContent = `
      .kana-chart {
        position: relative;
        background: linear-gradient(140deg, rgba(255, 255, 255, 0.96), rgba(226, 232, 255, 0.92));
        border-radius: 28px;
        padding: clamp(1.5rem, 3vw, 2.5rem);
        box-shadow: 0 28px 60px rgba(71, 85, 105, 0.18);
        display: flex;
        flex-direction: column;
        gap: 1.75rem;
        color: #0f172a;
        font-family: "Noto Sans JP", "Noto Sans SC", "Hiragino Sans", "Segoe UI", sans-serif;
      }

      .kana-chart[data-mode="kata"] .kana-toggle[data-mode="kata"],
      .kana-chart[data-mode="hira"] .kana-toggle[data-mode="hira"],
      .kana-chart[data-mode="both"] .kana-toggle[data-mode="both"] {
        background: linear-gradient(135deg, #4f46e5, #6366f1);
        color: #fff;
        box-shadow: 0 12px 30px rgba(99, 102, 241, 0.35);
      }

      .kana-chart__header {
        display: flex;
        flex-wrap: wrap;
        gap: 1.5rem;
        align-items: flex-end;
        justify-content: space-between;
      }

      .kana-chart__title {
        margin: 0;
        font-size: clamp(1.6rem, 4vw, 2.1rem);
        letter-spacing: 0.03em;
        font-weight: 700;
        color: #1e293b;
      }

      .kana-chart__desc {
        margin: 0.35rem 0 0;
        max-width: 36ch;
        font-size: 1rem;
        line-height: 1.6;
        color: #475569;
      }

      .kana-chart__controls {
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        gap: 0.5rem;
        min-width: 200px;
      }

      .kana-chart__controls-label {
        font-size: 0.82rem;
        font-weight: 600;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: #64748b;
      }

      .kana-toggle-group {
        display: inline-flex;
        gap: 0.4rem;
        padding: 0.4rem;
        border-radius: 999px;
        background: rgba(148, 163, 184, 0.18);
        backdrop-filter: blur(10px);
      }

      .kana-toggle {
        border: none;
        background: transparent;
        color: #334155;
        font-weight: 600;
        font-size: 0.9rem;
        padding: 0.42rem 1.05rem;
        border-radius: 999px;
        cursor: pointer;
        transition: transform 0.18s ease, box-shadow 0.18s ease, background 0.18s ease, color 0.18s ease;
      }

      .kana-toggle:hover,
      .kana-toggle:focus-visible {
        transform: translateY(-1px);
        box-shadow: 0 8px 18px rgba(148, 163, 184, 0.25);
      }

      .kana-toggle:focus-visible {
        outline: 3px solid rgba(99, 102, 241, 0.45);
        outline-offset: 2px;
      }

      .kana-section {
        display: flex;
        flex-direction: column;
        gap: 0.8rem;
      }

      .kana-section__title {
        margin: 0;
        font-size: 1rem;
        font-weight: 700;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        color: #475569;
      }

      .kana-grid-wrapper {
        overflow-x: auto;
        padding-bottom: 0.35rem;
      }

      .kana-grid-wrapper::-webkit-scrollbar {
        height: 8px;
      }

      .kana-grid-wrapper::-webkit-scrollbar-thumb {
        background: rgba(99, 102, 241, 0.4);
        border-radius: 999px;
      }

      .kana-grid {
        display: grid;
        grid-template-columns: minmax(72px, auto) repeat(var(--data-cols), minmax(92px, 1fr));
        gap: 0.65rem;
        align-items: stretch;
        min-width: min(100%, calc(72px + var(--data-cols) * 100px));
      }

      .kana-grid__header {
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 0.82rem;
        font-weight: 700;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        color: #64748b;
        padding-bottom: 0.2rem;
      }

      .kana-grid__label-header {
        justify-content: flex-start;
        padding-left: 0.75rem;
      }

      .kana-grid__label {
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: 700;
        font-size: 0.95rem;
        color: #1f2937;
        border-radius: 16px;
        background: rgba(148, 163, 184, 0.16);
        backdrop-filter: blur(2px);
      }

      .kana-card {
        position: relative;
        border: none;
        border-radius: 20px;
        padding: 1.2rem 0.75rem 1rem;
        background: linear-gradient(165deg, rgba(255, 255, 255, 0.98), rgba(223, 231, 255, 0.92));
        box-shadow: 0 14px 30px rgba(99, 102, 241, 0.16);
        display: flex;
        flex-direction: column;
        gap: 0.4rem;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        transition: transform 0.2s ease, box-shadow 0.2s ease, background 0.2s ease;
        min-height: 110px;
        text-align: center;
        color: #0f172a;
      }

      .kana-card:hover,
      .kana-card:focus-visible {
        transform: translateY(-4px) scale(1.015);
        box-shadow: 0 20px 36px rgba(99, 102, 241, 0.26);
        background: linear-gradient(165deg, rgba(255, 255, 255, 0.99), rgba(209, 216, 255, 0.97));
      }

      .kana-card:focus-visible {
        outline: 3px solid rgba(99, 102, 241, 0.5);
        outline-offset: 3px;
      }

      .kana-card.is-active {
        box-shadow: 0 22px 40px rgba(79, 70, 229, 0.35);
        background: linear-gradient(170deg, rgba(97, 106, 255, 0.08), rgba(255, 255, 255, 0.98));
      }

      .kana-card.is-empty {
        background: transparent;
        box-shadow: none;
        cursor: default;
        pointer-events: none;
        border: 1px dashed rgba(148, 163, 184, 0.2);
      }

      .kana-card__main {
        font-size: clamp(2.1rem, 4vw, 2.6rem);
        font-weight: 600;
        transition: transform 0.18s ease, opacity 0.18s ease;
      }

      .kana-card__corner {
        position: absolute;
        right: 12px;
        bottom: 10px;
        font-size: 0.88rem;
        font-weight: 600;
        color: #475569;
        opacity: 0.88;
        transition: opacity 0.2s ease, transform 0.2s ease;
      }

      .kana-card__roma {
        font-size: 0.78rem;
        font-weight: 600;
        letter-spacing: 0.18em;
        color: #64748b;
        text-transform: uppercase;
      }

      .kana-card[data-display="kata"] .kana-card__corner,
      .kana-card[data-display="hira"] .kana-card__corner {
        display: none;
      }

      .kana-card.is-playing::after {
        content: "";
        position: absolute;
        inset: 0;
        border-radius: inherit;
        background: radial-gradient(circle at center, rgba(99, 102, 241, 0.24), rgba(99, 102, 241, 0));
        animation: kana-pulse 0.5s ease-out forwards;
        pointer-events: none;
      }

      @keyframes kana-pulse {
        from {
          opacity: 0.9;
          transform: scale(0.94);
        }
        to {
          opacity: 0;
          transform: scale(1.12);
        }
      }

      .kana-chart__hint {
        margin: 0;
        text-align: center;
        font-size: 0.95rem;
        color: #64748b;
        line-height: 1.5;
      }

      @media (max-width: 860px) {
        .kana-chart__controls {
          align-items: flex-start;
          min-width: 0;
        }
        .kana-chart__desc {
          max-width: none;
        }
      }

      @media (max-width: 640px) {
        .kana-chart {
          padding: 1.35rem;
        }
        .kana-chart__header {
          align-items: flex-start;
        }
        .kana-chart__controls {
          width: 100%;
        }
        .kana-grid {
          grid-template-columns: minmax(60px, auto) repeat(var(--data-cols), minmax(88px, 1fr));
        }
      }

      @media (prefers-reduced-motion: reduce) {
        .kana-toggle,
        .kana-card {
          transition: none;
        }
        .kana-card.is-playing::after {
          animation: none;
        }
      }
    `;
        document.head.appendChild(style);
    };

    ensureStyles();

    const scriptBase = (() => {
        if (window.__currentPostBaseURL) return window.__currentPostBaseURL;
        const currentScript = document.currentScript;
        if (currentScript && currentScript.src) {
            try {
                return new URL("./", currentScript.src).toString();
            } catch (err) {
                return "";
            }
        }
        return "";
    })();

    const resolveAsset = (relativePath) => {
        if (!relativePath) return "";
        if (scriptBase) {
            try {
                return new URL(relativePath, scriptBase).toString();
            } catch (err) {
                return relativePath;
            }
        }
        return relativePath;
    };

    // 检测语言环境并归一化语言代码
    const preferredLang =
        window.__currentPostLang ||
        document.documentElement.lang ||
        document.documentElement.getAttribute("lang") ||
        "zh";
    const rawLang = preferredLang.toLowerCase();
    const baseLang = rawLang.split("-")[0];
    const lang = baseLang === "jp" ? "ja" : baseLang;

    const translations = {
        zh: {
            title: "五十音图学习",
            desc: "点击任意假名即可播放标准东京女声发音，可切换平假名、片假名或双显模式。",
            hint: "提示：点击假名播放发音。",
            hira: "平假名",
            kata: "片假名",
            both: "同时显示",
            display: "显示模式",
            rowHeader: "行/段",
            columnLabels: { a: "a", i: "i", u: "u", e: "e", o: "o", ya: "ya", yu: "yu", yo: "yo" },
            sections: {
                seion: "清音",
                dakuten: "浊音・半浊音",
                youon: "拗音"
            }
        },
        en: {
            title: "Japanese Kana Chart",
            desc: "Tap any card to hear a Tokyo-standard female voice. Toggle Hiragana, Katakana, or show both at once.",
            hint: "Tip: Click on a kana to play its pronunciation.",
            hira: "Hiragana",
            kata: "Katakana",
            both: "Both",
            display: "Display Mode",
            rowHeader: "Row",
            columnLabels: { a: "a", i: "i", u: "u", e: "e", o: "o", ya: "ya", yu: "yu", yo: "yo" },
            sections: {
                seion: "Basic Kana",
                dakuten: "Dakuten & Handakuten",
                youon: "Youon (Contracted Sounds)"
            }
        },
        ja: {
            title: "五十音図",
            desc: "カードをクリックすると東京標準の女性音声が再生されます。ひらがな・カタカナ・両方の表示を切り替えましょう。",
            hint: "ヒント：仮名をクリックすると発音が再生されます。",
            hira: "ひらがな",
            kata: "カタカナ",
            both: "両方",
            display: "表示モード",
            rowHeader: "行",
            columnLabels: { a: "a", i: "i", u: "u", e: "e", o: "o", ya: "ya", yu: "yu", yo: "yo" },
            sections: {
                seion: "清音",
                dakuten: "濁音・半濁音",
                youon: "拗音"
            }
        }
    };

    const text = translations[lang] || translations.zh;
    const columnLabel = (key) => (text.columnLabels && text.columnLabels[key]) || key;

    const createKana = (hira, kata, roma, audioName) => ({
        hira,
        kata,
        roma,
        audio: audioName || roma
    });

    const sections = [
        {
            key: "seion",
            columns: ["a", "i", "u", "e", "o"],
            rows: [
                {
                    label: "∅",
                    cells: [
                        createKana("あ", "ア", "a"),
                        createKana("い", "イ", "i"),
                        createKana("う", "ウ", "u"),
                        createKana("え", "エ", "e"),
                        createKana("お", "オ", "o")
                    ]
                },
                {
                    label: "k",
                    cells: [
                        createKana("か", "カ", "ka"),
                        createKana("き", "キ", "ki"),
                        createKana("く", "ク", "ku"),
                        createKana("け", "ケ", "ke"),
                        createKana("こ", "コ", "ko")
                    ]
                },
                {
                    label: "s",
                    cells: [
                        createKana("さ", "サ", "sa"),
                        createKana("し", "シ", "shi", "shi"),
                        createKana("す", "ス", "su"),
                        createKana("せ", "セ", "se"),
                        createKana("そ", "ソ", "so")
                    ]
                },
                {
                    label: "t",
                    cells: [
                        createKana("た", "タ", "ta"),
                        createKana("ち", "チ", "chi", "chi"),
                        createKana("つ", "ツ", "tsu", "tsu"),
                        createKana("て", "テ", "te"),
                        createKana("と", "ト", "to")
                    ]
                },
                {
                    label: "n",
                    cells: [
                        createKana("な", "ナ", "na"),
                        createKana("に", "ニ", "ni"),
                        createKana("ぬ", "ヌ", "nu"),
                        createKana("ね", "ネ", "ne"),
                        createKana("の", "ノ", "no")
                    ]
                },
                {
                    label: "h",
                    cells: [
                        createKana("は", "ハ", "ha"),
                        createKana("ひ", "ヒ", "hi"),
                        createKana("ふ", "フ", "fu", "fu"),
                        createKana("へ", "ヘ", "he"),
                        createKana("ほ", "ホ", "ho")
                    ]
                },
                {
                    label: "m",
                    cells: [
                        createKana("ま", "マ", "ma"),
                        createKana("み", "ミ", "mi"),
                        createKana("む", "ム", "mu"),
                        createKana("め", "メ", "me"),
                        createKana("も", "モ", "mo")
                    ]
                },
                {
                    label: "y",
                    cells: [
                        createKana("や", "ヤ", "ya"),
                        null,
                        createKana("ゆ", "ユ", "yu"),
                        null,
                        createKana("よ", "ヨ", "yo")
                    ]
                },
                {
                    label: "r",
                    cells: [
                        createKana("ら", "ラ", "ra"),
                        createKana("り", "リ", "ri"),
                        createKana("る", "ル", "ru"),
                        createKana("れ", "レ", "re"),
                        createKana("ろ", "ロ", "ro")
                    ]
                },
                {
                    label: "w",
                    cells: [
                        createKana("わ", "ワ", "wa"),
                        null,
                        null,
                        null,
                        createKana("を", "ヲ", "wo")
                    ]
                },
                {
                    label: "ん",
                    cells: [
                        createKana("ん", "ン", "n"),
                        null,
                        null,
                        null,
                        null
                    ]
                }
            ]
        },
        {
            key: "dakuten",
            columns: ["a", "i", "u", "e", "o"],
            rows: [
                {
                    label: "g",
                    cells: [
                        createKana("が", "ガ", "ga"),
                        createKana("ぎ", "ギ", "gi"),
                        createKana("ぐ", "グ", "gu"),
                        createKana("げ", "ゲ", "ge"),
                        createKana("ご", "ゴ", "go")
                    ]
                },
                {
                    label: "z",
                    cells: [
                        createKana("ざ", "ザ", "za"),
                        createKana("じ", "ジ", "ji", "ji"),
                        createKana("ず", "ズ", "zu", "zu"),
                        createKana("ぜ", "ゼ", "ze"),
                        createKana("ぞ", "ゾ", "zo")
                    ]
                },
                {
                    label: "d",
                    cells: [
                        createKana("だ", "ダ", "da"),
                        createKana("ぢ", "ヂ", "ji", "ji"),
                        createKana("づ", "ヅ", "zu", "zu"),
                        createKana("で", "デ", "de"),
                        createKana("ど", "ド", "do")
                    ]
                },
                {
                    label: "b",
                    cells: [
                        createKana("ば", "バ", "ba"),
                        createKana("び", "ビ", "bi"),
                        createKana("ぶ", "ブ", "bu"),
                        createKana("べ", "ベ", "be"),
                        createKana("ぼ", "ボ", "bo")
                    ]
                },
                {
                    label: "p",
                    cells: [
                        createKana("ぱ", "パ", "pa"),
                        createKana("ぴ", "ピ", "pi"),
                        createKana("ぷ", "プ", "pu"),
                        createKana("ぺ", "ペ", "pe"),
                        createKana("ぽ", "ポ", "po")
                    ]
                }
            ]
        },
        {
            key: "youon",
            columns: ["ya", "yu", "yo"],
            rows: [
                {
                    label: "ky",
                    cells: [
                        createKana("きゃ", "キャ", "kya", "kya"),
                        createKana("きゅ", "キュ", "kyu", "kyu"),
                        createKana("きょ", "キョ", "kyo", "kyo")
                    ]
                },
                {
                    label: "gy",
                    cells: [
                        createKana("ぎゃ", "ギャ", "gya", "gya"),
                        createKana("ぎゅ", "ギュ", "gyu", "gyu"),
                        createKana("ぎょ", "ギョ", "gyo", "gyo")
                    ]
                },
                {
                    label: "sh",
                    cells: [
                        createKana("しゃ", "シャ", "sha", "sha"),
                        createKana("しゅ", "シュ", "shu", "shu"),
                        createKana("しょ", "ショ", "sho", "sho")
                    ]
                },
                {
                    label: "j",
                    cells: [
                        createKana("じゃ", "ジャ", "ja", "ja"),
                        createKana("じゅ", "ジュ", "ju", "ju"),
                        createKana("じょ", "ジョ", "jo", "jo")
                    ]
                },
                {
                    label: "ch",
                    cells: [
                        createKana("ちゃ", "チャ", "cha", "cha"),
                        createKana("ちゅ", "チュ", "chu", "chu"),
                        createKana("ちょ", "チョ", "cho", "cho")
                    ]
                },
                {
                    label: "ny",
                    cells: [
                        createKana("にゃ", "ニャ", "nya", "nya"),
                        createKana("にゅ", "ニュ", "nyu", "nyu"),
                        createKana("にょ", "ニョ", "nyo", "nyo")
                    ]
                },
                {
                    label: "hy",
                    cells: [
                        createKana("ひゃ", "ヒャ", "hya", "hya"),
                        createKana("ひゅ", "ヒュ", "hyu", "hyu"),
                        createKana("ひょ", "ヒョ", "hyo", "hyo")
                    ]
                },
                {
                    label: "my",
                    cells: [
                        createKana("みゃ", "ミャ", "mya", "mya"),
                        createKana("みゅ", "ミュ", "myu", "myu"),
                        createKana("みょ", "ミョ", "myo", "myo")
                    ]
                },
                {
                    label: "ry",
                    cells: [
                        createKana("りゃ", "リャ", "rya", "rya"),
                        createKana("りゅ", "リュ", "ryu", "ryu"),
                        createKana("りょ", "リョ", "ryo", "ryo")
                    ]
                },
                {
                    label: "by",
                    cells: [
                        createKana("びゃ", "ビャ", "bya", "bya"),
                        createKana("びゅ", "ビュ", "byu", "byu"),
                        createKana("びょ", "ビョ", "byo", "byo")
                    ]
                },
                {
                    label: "py",
                    cells: [
                        createKana("ぴゃ", "ピャ", "pya", "pya"),
                        createKana("ぴゅ", "ピュ", "pyu", "pyu"),
                        createKana("ぴょ", "ピョ", "pyo", "pyo")
                    ]
                }
            ]
        }
    ];

    const renderCard = (item) => {
        if (!item) {
            return `<div class="kana-card is-empty" aria-hidden="true"></div>`;
        }
        const aria = `${item.hira}・${item.kata} (${item.roma})`;
        return `
      <button class="kana-card" type="button"
        data-sound="${item.audio}"
        data-hira="${item.hira}"
        data-kata="${item.kata}"
        data-roma="${item.roma}"
        data-display="both"
        aria-label="${aria}">
        <span class="kana-card__main">${item.hira}</span>
        <span class="kana-card__corner">${item.kata}</span>
        <span class="kana-card__roma">${item.roma}</span>
      </button>
    `;
    };

    const renderSection = (section) => {
        const headerCells = section.columns
            .map((col) => `<div class="kana-grid__header">${columnLabel(col)}</div>`)
            .join("");
        const rows = section.rows
            .map((row) => {
                const cells = row.cells
                    .map((cell) => renderCard(cell))
                    .join("");
                return `<div class="kana-grid__label">${row.label}</div>${cells}`;
            })
            .join("");
        const title = (text.sections && text.sections[section.key]) || section.key;
        return `
      <section class="kana-section" data-section="${section.key}">
        <h3 class="kana-section__title">${title}</h3>
        <div class="kana-grid-wrapper">
          <div class="kana-grid" style="--data-cols:${section.columns.length}">
            <div class="kana-grid__header kana-grid__label-header">${text.rowHeader}</div>
            ${headerCells}
            ${rows}
          </div>
        </div>
      </section>
    `;
    };

    target.innerHTML = `
    <div class="kana-chart" data-mode="both">
      <header class="kana-chart__header">
        <div class="kana-chart__copy">
          <h2 class="kana-chart__title">${text.title}</h2>
          <p class="kana-chart__desc">${text.desc}</p>
        </div>
        <div class="kana-chart__controls">
          <span class="kana-chart__controls-label">${text.display}</span>
          <div class="kana-toggle-group" role="group" aria-label="${text.display}">
            <button class="kana-toggle" type="button" data-mode="hira">${text.hira}</button>
            <button class="kana-toggle" type="button" data-mode="kata">${text.kata}</button>
            <button class="kana-toggle is-active" type="button" data-mode="both">${text.both}</button>
          </div>
        </div>
      </header>
      ${sections.map(renderSection).join("")}
      <p class="kana-chart__hint">${text.hint}</p>
      <audio id="kana-audio" preload="none"></audio>
    </div>
  `;

    const root = target.querySelector(".kana-chart");
    const audio = target.querySelector("#kana-audio");
    const toggles = Array.from(target.querySelectorAll(".kana-toggle"));
    const cards = Array.from(target.querySelectorAll(".kana-card[data-sound]"));
    let currentMode = "both";
    let activeCard = null;

    const setDisplayMode = (mode) => {
        currentMode = mode;
        root.dataset.mode = mode;
        toggles.forEach((btn) => btn.classList.toggle("is-active", btn.dataset.mode === mode));
        cards.forEach((card) => {
            const main = card.querySelector(".kana-card__main");
            if (!main) return;
            if (mode === "kata") {
                main.textContent = card.dataset.kata;
            } else {
                main.textContent = card.dataset.hira;
            }
            card.dataset.display = mode;
        });
    };

    const highlightCard = (card) => {
        if (activeCard && activeCard !== card) {
            activeCard.classList.remove("is-active");
            activeCard.classList.remove("is-playing");
        }
        activeCard = card;
        card.classList.add("is-active");
        card.classList.remove("is-playing");
        // force repaint to replay animation
        void card.offsetWidth;
        card.classList.add("is-playing");
    };

    const playSound = (sound, card) => {
        if (!sound || !audio) return;
        highlightCard(card);
        audio.src = resolveAsset(`media/audio/${sound}.mp3`);
        audio.currentTime = 0;
        audio.play().catch(() => {
            // 忽略播放异常，例如用户未与页面交互
        });
    };

    toggles.forEach((btn) => {
        btn.addEventListener("click", () => {
            const mode = btn.dataset.mode;
            if (mode === currentMode) return;
            setDisplayMode(mode);
        });
    });

    cards.forEach((card) => {
        card.addEventListener("click", () => {
            playSound(card.dataset.sound, card);
        });
        card.addEventListener("keydown", (evt) => {
            if (evt.code === "Space" || evt.code === "Enter") {
                evt.preventDefault();
                playSound(card.dataset.sound, card);
            }
        });
    });

    setDisplayMode(currentMode);

    document.addEventListener(
        "click",
        (event) => {
            if (!activeCard) return;
            if (activeCard.contains(event.target)) return;

            activeCard.classList.remove("is-active");
            activeCard.classList.remove("is-playing");
            activeCard = null;
        },
        { capture: true }
    );
})();
