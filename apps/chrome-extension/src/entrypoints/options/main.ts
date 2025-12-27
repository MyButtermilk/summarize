import { defaultSettings, loadSettings, saveSettings } from '../../lib/settings'
import { readPresetOrCustomValue, resolvePresetOrCustom } from '../../lib/combo'

function byId<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id)
  if (!el) throw new Error(`Missing #${id}`)
  return el as T
}

const formEl = byId<HTMLFormElement>('form')
const statusEl = byId<HTMLSpanElement>('status')

const tokenEl = byId<HTMLInputElement>('token')
const modelEl = byId<HTMLInputElement>('model')
const lengthPresetEl = byId<HTMLSelectElement>('lengthPreset')
const lengthCustomEl = byId<HTMLInputElement>('lengthCustom')
const languagePresetEl = byId<HTMLSelectElement>('languagePreset')
const languageCustomEl = byId<HTMLInputElement>('languageCustom')
const promptOverrideEl = byId<HTMLTextAreaElement>('promptOverride')
const autoEl = byId<HTMLInputElement>('auto')
const maxCharsEl = byId<HTMLInputElement>('maxChars')
const fontFamilyEl = byId<HTMLInputElement>('fontFamily')
const fontSizeEl = byId<HTMLInputElement>('fontSize')

const setStatus = (text: string) => {
  statusEl.textContent = text
}

const lengthPresets = ['short', 'medium', 'long', 'xl', 'xxl', '20k']
const languagePresets = ['auto', 'en', 'de', 'es', 'fr', 'it', 'pt', 'ja', 'zh', 'ko']

async function load() {
  const s = await loadSettings()
  tokenEl.value = s.token
  modelEl.value = s.model
  {
    const resolved = resolvePresetOrCustom({ value: s.length, presets: lengthPresets })
    lengthPresetEl.value = resolved.presetValue
    lengthCustomEl.hidden = !resolved.isCustom
    lengthCustomEl.value = resolved.customValue
  }
  {
    const resolved = resolvePresetOrCustom({ value: s.language, presets: languagePresets })
    languagePresetEl.value = resolved.presetValue
    languageCustomEl.hidden = !resolved.isCustom
    languageCustomEl.value = resolved.customValue
  }
  promptOverrideEl.value = s.promptOverride
  autoEl.checked = s.autoSummarize
  maxCharsEl.value = String(s.maxChars)
  fontFamilyEl.value = s.fontFamily
  fontSizeEl.value = String(s.fontSize)
}

lengthPresetEl.addEventListener('change', () => {
  lengthCustomEl.hidden = lengthPresetEl.value !== 'custom'
  if (!lengthCustomEl.hidden) lengthCustomEl.focus()
})
languagePresetEl.addEventListener('change', () => {
  languageCustomEl.hidden = languagePresetEl.value !== 'custom'
  if (!languageCustomEl.hidden) languageCustomEl.focus()
})

formEl.addEventListener('submit', (e) => {
  e.preventDefault()
  void (async () => {
    setStatus('Saving…')
    await saveSettings({
      token: tokenEl.value || defaultSettings.token,
      model: modelEl.value || defaultSettings.model,
      length: readPresetOrCustomValue({
        presetValue: lengthPresetEl.value,
        customValue: lengthCustomEl.value,
        defaultValue: defaultSettings.length,
      }),
      language: readPresetOrCustomValue({
        presetValue: languagePresetEl.value,
        customValue: languageCustomEl.value,
        defaultValue: defaultSettings.language,
      }),
      promptOverride: promptOverrideEl.value || defaultSettings.promptOverride,
      autoSummarize: autoEl.checked,
      maxChars: Number(maxCharsEl.value) || defaultSettings.maxChars,
      fontFamily: fontFamilyEl.value || defaultSettings.fontFamily,
      fontSize: Number(fontSizeEl.value) || defaultSettings.fontSize,
    })
    setStatus('Saved')
    setTimeout(() => setStatus(''), 900)
  })()
})

void load()
