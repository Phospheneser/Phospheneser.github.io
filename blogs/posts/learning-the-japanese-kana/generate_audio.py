import os
from gtts import gTTS

# === 五十音表 ===
kana_map = {
    # 清音
    "a": "あ",
    "i": "い",
    "u": "う",
    "e": "え",
    "o": "お",
    "ka": "か",
    "ki": "き",
    "ku": "く",
    "ke": "け",
    "ko": "こ",
    "sa": "さ",
    "shi": "し",
    "su": "す",
    "se": "せ",
    "so": "そ",
    "ta": "た",
    "chi": "ち",
    "tsu": "つ",
    "te": "て",
    "to": "と",
    "na": "な",
    "ni": "に",
    "nu": "ぬ",
    "ne": "ね",
    "no": "の",
    "ha": "は",
    "hi": "ひ",
    "fu": "ふ",
    "he": "へ",
    "ho": "ほ",
    "ma": "ま",
    "mi": "み",
    "mu": "む",
    "me": "め",
    "mo": "も",
    "ya": "や",
    "yu": "ゆ",
    "yo": "よ",
    "ra": "ら",
    "ri": "り",
    "ru": "る",
    "re": "れ",
    "ro": "ろ",
    "wa": "わ",
    "wo": "を",
    "n": "ん",
    # 浊音
    "ga": "が",
    "gi": "ぎ",
    "gu": "ぐ",
    "ge": "げ",
    "go": "ご",
    "za": "ざ",
    "ji": "じ",
    "zu": "ず",
    "ze": "ぜ",
    "zo": "ぞ",
    "da": "だ",
    "di": "ぢ",
    "du": "づ",
    "de": "で",
    "do": "ど",
    "ba": "ば",
    "bi": "び",
    "bu": "ぶ",
    "be": "べ",
    "bo": "ぼ",
    "pa": "ぱ",
    "pi": "ぴ",
    "pu": "ぷ",
    "pe": "ぺ",
    "po": "ぽ",
    # 拗音
    "kya": "きゃ",
    "kyu": "きゅ",
    "kyo": "きょ",
    "sha": "しゃ",
    "shu": "しゅ",
    "sho": "しょ",
    "cha": "ちゃ",
    "chu": "ちゅ",
    "cho": "ちょ",
    "nya": "にゃ",
    "nyu": "にゅ",
    "nyo": "にょ",
    "hya": "ひゃ",
    "hyu": "ひゅ",
    "hyo": "ひょ",
    "mya": "みゃ",
    "myu": "みゅ",
    "myo": "みょ",
    "rya": "りゃ",
    "ryu": "りゅ",
    "ryo": "りょ",
    "gya": "ぎゃ",
    "gyu": "ぎゅ",
    "gyo": "ぎょ",
    "ja": "じゃ",
    "ju": "じゅ",
    "jo": "じょ",
    "bya": "びゃ",
    "byu": "びゅ",
    "byo": "びょ",
    "pya": "ぴゃ",
    "pyu": "ぴゅ",
    "pyo": "ぴょ",
}

# === 目标目录 ===
output_dir = os.path.join("media", "audio")
os.makedirs(output_dir, exist_ok=True)

# === 生成音频 ===
print(f"🎙️ 开始生成 {len(kana_map)} 个假名音频...")

for romaji, kana in kana_map.items():
    out_path = os.path.join(output_dir, f"{romaji}.mp3")
    if os.path.exists(out_path):
        print(f"✅ 已存在：{romaji}")
        continue
    try:
        tts = gTTS(text=kana, lang="ja", slow=False)
        tts.save(out_path)
        print(f"🟢 生成完成：{romaji}.mp3  ({kana})")
    except Exception as e:
        print(f"❌ 生成失败 {romaji}: {e}")

print(f"✅ 全部完成，文件保存在 {output_dir}/ 下。")
