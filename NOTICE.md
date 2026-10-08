# Third-party notices

yomiage's own code is MIT-licensed (see [LICENSE](LICENSE)). It downloads and runs the components below, which keep
their own licences and terms. **Apps that use yomiage must follow them, in particular the Tsukuyomi-chan credit.**

## Voice

| Component | Source | Terms |
|---|---|---|
| つくよみちゃん (Tsukuyomi-chan) voice model | [ayousanz/piper-plus-tsukuyomi-chan](https://huggingface.co/ayousanz/piper-plus-tsukuyomi-chan), trained on the [つくよみちゃんコーパス](https://tyc.rei-yumesaki.net/material/corpus/) | Follows the corpus terms: use by individuals and companies, commercial or not; **credit required** for speech-synthesis software (below); some uses are prohibited (e.g. attacking or criticising people, promoting or opposing specific political or religious positions, publishing extreme content without age gating, selling the generated audio as material). Anything the corpus page doesn't cover follows the [character licence](https://tyc.rei-yumesaki.net/about/terms/). |

**Required credit** (exported by yomiage as `CREDIT`):

> 音声合成には、フリー素材キャラクター「つくよみちゃん」（© Rei Yumesaki）が無料公開している音声データを使用しています。
> ■つくよみちゃんコーパス（CV.夢前黎）https://tyc.rei-yumesaki.net/material/corpus/

## Software

| Component | Use | Licence |
|---|---|---|
| [piper-plus](https://github.com/ayutaz/piper-plus) (`piper-plus`, `@piper-plus/g2p`) | speech synthesis, Japanese phonemizer (includes an OpenJTalk-based dictionary) | MIT (see the piper-plus repository for the licences of the bundled dictionary data) |
| [ONNX Runtime Web](https://github.com/microsoft/onnxruntime) | runs the voice model | MIT |
