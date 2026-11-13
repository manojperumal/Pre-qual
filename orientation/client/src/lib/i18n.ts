import { useCallback, useEffect, useState } from 'react'

export type Lang = 'en' | 'es'
export const LANG_NAMES: Record<Lang, string> = { en: 'English', es: 'Español' }

const strings = {
  chooseLanguage: { en: 'Choose your language', es: 'Elija su idioma' },
  siteOrientation: { en: 'Site orientation', es: 'Orientación de la obra' },
  intro: {
    en: 'Get cleared for site before your first shift. It takes about 20 minutes on your phone. You can stop and come back any time.',
    es: 'Obtenga su autorización antes de su primer turno. Toma unos 20 minutos en su teléfono. Puede parar y volver en cualquier momento.',
  },
  start: { en: 'Start', es: 'Empezar' },
  continue: { en: 'Continue', es: 'Continuar' },
  next: { en: 'Next', es: 'Siguiente' },
  back: { en: 'Back', es: 'Atrás' },
  phoneTitle: { en: 'Your mobile number', es: 'Su número de celular' },
  phoneHelp: {
    en: 'We will text you a code. No password, no app to install.',
    es: 'Le enviaremos un código por mensaje de texto. Sin contraseña y sin instalar una aplicación.',
  },
  sendCode: { en: 'Text me a code', es: 'Enviarme un código' },
  codeTitle: { en: 'Enter the code', es: 'Escriba el código' },
  codeHelp: { en: 'We sent a 6-digit code to', es: 'Enviamos un código de 6 dígitos a' },
  verify: { en: 'Verify', es: 'Verificar' },
  resend: { en: 'Send a new code', es: 'Enviar otro código' },
  devCode: { en: 'Test mode — your code is', es: 'Modo de prueba — su código es' },
  aboutYou: { en: 'About you', es: 'Sus datos' },
  fullName: { en: 'Full name', es: 'Nombre completo' },
  employer: { en: 'Who do you work for?', es: '¿Para quién trabaja?' },
  employerPick: { en: 'Choose your company', es: 'Elija su empresa' },
  employerOther: { en: 'My company is not listed', es: 'Mi empresa no aparece' },
  employerName: { en: 'Company name', es: 'Nombre de la empresa' },
  crew: { en: 'Crew or foreman (optional)', es: 'Cuadrilla o capataz (opcional)' },
  trade: { en: 'Your trade', es: 'Su oficio' },
  tradeGeneral: { en: 'General / other', es: 'General / otro' },
  startDate: { en: 'First day on site (optional)', es: 'Primer día en la obra (opcional)' },
  photoTitle: { en: 'Take your photo', es: 'Tómese una foto' },
  photoHelp: {
    en: 'The gate uses this photo to confirm it is you on your first day. Face the camera, no hat or sunglasses.',
    es: 'En la entrada usarán esta foto para confirmar que es usted en su primer día. Mire a la cámara, sin gorra ni lentes de sol.',
  },
  takePhoto: { en: 'Open camera', es: 'Abrir cámara' },
  retake: { en: 'Take again', es: 'Tomar otra' },
  usePhoto: { en: 'Use this photo', es: 'Usar esta foto' },
  yourOrientation: { en: 'Your orientation', es: 'Su orientación' },
  modulesDone: { en: 'parts done', es: 'partes completadas' },
  done: { en: 'Done', es: 'Listo' },
  updated: { en: 'Updated — review the changes', es: 'Actualizado — revise los cambios' },
  expiredModule: { en: 'Expired — take it again', es: 'Vencido — vuelva a tomarlo' },
  listen: { en: 'Listen', es: 'Escuchar' },
  stop: { en: 'Stop', es: 'Detener' },
  autoRead: { en: 'Read aloud automatically', es: 'Leer en voz alta automáticamente' },
  quickCheck: { en: 'Quick check', es: 'Pregunta rápida' },
  correct: { en: 'Correct!', es: '¡Correcto!' },
  notQuite: { en: 'Not quite. Let’s go over it again:', es: 'No exactamente. Repasemos:' },
  tryAgain: { en: 'Try the question again', es: 'Intente la pregunta otra vez' },
  finishModule: { en: 'Finish this part', es: 'Terminar esta parte' },
  signTitle: { en: 'Sign your orientation', es: 'Firme su orientación' },
  typeName: { en: 'Type your full name to sign', es: 'Escriba su nombre completo para firmar' },
  sign: { en: 'I agree and sign', es: 'Acepto y firmo' },
  needPhoto: { en: 'Take your photo first', es: 'Primero tómese la foto' },
  credential: { en: 'Your site pass', es: 'Su pase de la obra' },
  showAtGate: {
    en: 'Show this code at the gate. Save this page to your home screen to find it fast.',
    es: 'Muestre este código en la entrada. Guarde esta página en su pantalla de inicio para encontrarla rápido.',
  },
  pendingGate: {
    en: 'Almost there: on your first day, the gate checks your photo and then you are cleared.',
    es: 'Casi listo: en su primer día, en la entrada verifican su foto y queda autorizado.',
  },
  expires: { en: 'Expires', es: 'Vence' },
  notReady: {
    en: 'Orientation for this project is not open yet. You will get a text when it opens, or check back later.',
    es: 'La orientación de este proyecto aún no está abierta. Recibirá un mensaje cuando abra, o vuelva más tarde.',
  },
  notOpenYet: { en: 'Orientation opens on', es: 'La orientación abre el' },
  offline: { en: 'Offline — your progress is saved and will sync.', es: 'Sin conexión — su progreso está guardado y se sincronizará.' },
  myPasses: { en: 'My site passes', es: 'Mis pases de obra' },
  signOut: { en: 'Sign out', es: 'Cerrar sesión' },
  revoked: {
    en: 'Your clearance for this site is on hold. Talk to your foreman or the site safety team.',
    es: 'Su autorización para esta obra está en pausa. Hable con su capataz o con el equipo de seguridad.',
  },
  refreshNeeded: {
    en: 'Some orientation content changed. Review the updated parts to stay cleared.',
    es: 'Parte del contenido cambió. Revise las partes actualizadas para seguir autorizado.',
  },
  part: { en: 'Part', es: 'Parte' },
  of: { en: 'of', es: 'de' },
} as const

export type StringKey = keyof typeof strings

const KEY = 'orient_lang'

export function storedLang(): Lang | null {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'en' || v === 'es' ? v : null
  } catch {
    return null
  }
}

export function useLang() {
  const [lang, setLangState] = useState<Lang>(() => storedLang() ?? (navigator.language?.startsWith('es') ? 'es' : 'en'))
  useEffect(() => {
    document.documentElement.lang = lang
  }, [lang])
  const setLang = useCallback((l: Lang) => {
    try {
      localStorage.setItem(KEY, l)
    } catch {
      /* ignore */
    }
    setLangState(l)
  }, [])
  const t = useCallback((k: StringKey) => strings[k][lang], [lang])
  return { lang, setLang, t }
}
