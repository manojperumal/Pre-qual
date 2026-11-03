/**
 * Safety Mojo starter content. Owners clone the baseline into their
 * standard; GCs get one draft module per required project section (FR-11).
 *
 * Everything here is a TEMPLATE: it ships as drafts, the owner/GC edits it
 * for their sites, and Spanish text must be confirmed by a qualified human
 * reviewer before a version can be published (NFR: Language quality).
 * Template safety content also requires the customer's legal review
 * (PRD: Risks — Content liability).
 */

export type Lang = 'en' | 'es'
export type L10n = Partial<Record<Lang, string>> & Record<string, string | undefined>

export interface Segment {
  id: string
  text: L10n
  image_path?: string | null
}

export interface Check {
  id: string
  prompt: L10n
  options: Record<string, string[]>
  correct_index: number
  reteach: L10n
}

export interface ModuleContent {
  title?: L10n
  segments: Segment[]
  checks: Check[]
  delta?: { segments: Segment[]; checks: Check[] }
}

export interface TemplateModule {
  title: string
  section_key?: string
  content: ModuleContent
}

const seg = (id: string, en: string, es: string): Segment => ({ id, text: { en, es } })
const chk = (
  id: string,
  prompt: [string, string],
  options: [string[], string[]],
  correct_index: number,
  reteach: [string, string]
): Check => ({
  id,
  prompt: { en: prompt[0], es: prompt[1] },
  options: { en: options[0], es: options[1] },
  correct_index,
  reteach: { en: reteach[0], es: reteach[1] },
})

export const BASELINE_TEMPLATE: TemplateModule[] = [
  {
    title: 'Welcome and your safety rights',
    content: {
      segments: [
        seg(
          's1',
          'Welcome. This orientation takes about 20 minutes. You can stop at any time and pick up where you left off.',
          'Bienvenido. Esta orientación dura unos 20 minutos. Puede detenerse en cualquier momento y continuar donde lo dejó.'
        ),
        seg(
          's2',
          'On every project in this portfolio, everyone has the right to a safe workplace and the right to ask questions about any task.',
          'En todos los proyectos de este portafolio, todos tienen derecho a un lugar de trabajo seguro y a hacer preguntas sobre cualquier tarea.'
        ),
        seg(
          's3',
          'Anyone can stop work they believe is unsafe. You will never be punished for using stop-work authority in good faith.',
          'Cualquier persona puede detener un trabajo que crea que es inseguro. Nunca será castigado por usar la autoridad para detener el trabajo de buena fe.'
        ),
        seg(
          's4',
          'If you do not understand an instruction, ask your foreman before you start. Doing a task you do not understand is not allowed.',
          'Si no entiende una instrucción, pregúntele a su capataz antes de empezar. No está permitido hacer una tarea que no entiende.'
        ),
      ],
      checks: [
        chk(
          'c1',
          ['You see a task that looks unsafe. What can you do?', 'Ve una tarea que parece insegura. ¿Qué puede hacer?'],
          [
            ['Stop the work and tell your foreman', 'Keep working and mention it at lunch', 'Nothing — only supervisors can stop work'],
            ['Detener el trabajo y avisar a su capataz', 'Seguir trabajando y comentarlo en el almuerzo', 'Nada — solo los supervisores pueden detener el trabajo'],
          ],
          0,
          [
            'Every person on site has stop-work authority. If something looks unsafe, you are expected to stop it right away and get your foreman — no one will punish you for it.',
            'Cada persona en la obra tiene autoridad para detener el trabajo. Si algo parece inseguro, se espera que lo detenga de inmediato y llame a su capataz — nadie lo castigará por eso.',
          ]
        ),
        chk(
          'c2',
          ['You were given an instruction you do not understand. What should you do?', 'Le dieron una instrucción que no entiende. ¿Qué debe hacer?'],
          [
            ['Start and figure it out as you go', 'Ask your foreman before starting', 'Copy what the person next to you is doing'],
            ['Empezar y averiguarlo sobre la marcha', 'Preguntar a su capataz antes de empezar', 'Copiar lo que hace la persona a su lado'],
          ],
          1,
          [
            'Guessing is how people get hurt. The rule is simple: if you are not sure, you ask first, then you start.',
            'Adivinar es la forma en que la gente se lastima. La regla es simple: si no está seguro, primero pregunta y luego empieza.',
          ]
        ),
      ],
    },
  },
  {
    title: 'Hazard awareness and housekeeping',
    content: {
      segments: [
        seg(
          's1',
          'Most injuries on construction sites come from falls, being struck by objects, electrical contact, and being caught between equipment.',
          'La mayoría de las lesiones en las obras se deben a caídas, golpes por objetos, contacto eléctrico y quedar atrapado entre equipos.'
        ),
        seg(
          's2',
          'Keep walkways clear. Put tools and materials away, and coil cords and hoses so no one trips on them.',
          'Mantenga los pasillos despejados. Guarde las herramientas y materiales, y enrolle los cables y mangueras para que nadie se tropiece.'
        ),
        seg(
          's3',
          'Never walk under a suspended load. Stay out of the swing radius of cranes and excavators, and make eye contact with operators.',
          'Nunca camine debajo de una carga suspendida. Manténgase fuera del radio de giro de grúas y excavadoras, y haga contacto visual con los operadores.'
        ),
      ],
      checks: [
        chk(
          'c1',
          ['A crane is lifting a load across your path. What do you do?', 'Una grúa está levantando una carga sobre su camino. ¿Qué hace?'],
          [
            ['Walk quickly underneath', 'Wait or go around, outside the swing area', 'Signal the operator to stop'],
            ['Caminar rápido por debajo', 'Esperar o rodear, fuera del área de giro', 'Hacerle señas al operador para que pare'],
          ],
          1,
          [
            'Loads can fall without warning. The only safe place is outside the area where the load or the machine can swing — so you wait or walk around.',
            'Las cargas pueden caer sin aviso. El único lugar seguro es fuera del área donde la carga o la máquina puede girar — así que espere o rodee.',
          ]
        ),
      ],
    },
  },
  {
    title: 'PPE basics',
    content: {
      segments: [
        seg(
          's1',
          'Minimum PPE on every project: hard hat, safety glasses, high-visibility vest or shirt, and safety-toe boots.',
          'EPP mínimo en todos los proyectos: casco, lentes de seguridad, chaleco o camisa de alta visibilidad y botas con puntera de seguridad.'
        ),
        seg(
          's2',
          'Some tasks need more: gloves, hearing protection, face shields or respirators. Your task plan tells you what is required.',
          'Algunas tareas necesitan más: guantes, protección auditiva, caretas o respiradores. Su plan de tarea le indica lo que se requiere.'
        ),
        seg(
          's3',
          'Inspect your PPE before each shift. Damaged PPE must be replaced, not repaired with tape.',
          'Inspeccione su EPP antes de cada turno. El EPP dañado debe reemplazarse, no repararse con cinta.'
        ),
      ],
      checks: [
        chk(
          'c1',
          ['Which of these is part of the minimum PPE on every project?', '¿Cuál de estos forma parte del EPP mínimo en todos los proyectos?'],
          [
            ['Safety glasses', 'A respirator', 'A face shield'],
            ['Lentes de seguridad', 'Un respirador', 'Una careta'],
          ],
          0,
          [
            'The everyday minimum is four items: hard hat, safety glasses, high-visibility clothing and safety-toe boots. Respirators and face shields are added only for specific tasks.',
            'El mínimo diario son cuatro artículos: casco, lentes de seguridad, ropa de alta visibilidad y botas con puntera. Los respiradores y caretas se agregan solo para tareas específicas.',
          ]
        ),
        chk(
          'c2',
          ['Your hard hat has a crack. What should you do?', 'Su casco tiene una grieta. ¿Qué debe hacer?'],
          [
            ['Tape it and keep using it', 'Get it replaced before you work', 'Use it until the end of the week'],
            ['Ponerle cinta y seguir usándolo', 'Reemplazarlo antes de trabajar', 'Usarlo hasta el final de la semana'],
          ],
          1,
          [
            'A cracked hard hat will not protect you. Damaged PPE is swapped for new PPE before work starts — tape is never a fix.',
            'Un casco agrietado no lo protegerá. El EPP dañado se cambia por uno nuevo antes de empezar a trabajar — la cinta nunca es una solución.',
          ]
        ),
      ],
    },
  },
  {
    title: 'Reporting injuries, incidents and near misses',
    content: {
      segments: [
        seg(
          's1',
          'Report every injury, no matter how small, to your foreman right away — the same shift it happens.',
          'Reporte toda lesión, por pequeña que sea, a su capataz de inmediato — en el mismo turno en que ocurre.'
        ),
        seg(
          's2',
          'Also report near misses: events where nobody was hurt, but someone could have been. They help prevent the next injury.',
          'También reporte los casi accidentes: eventos en los que nadie resultó herido, pero alguien pudo haberlo sido. Ayudan a prevenir la próxima lesión.'
        ),
      ],
      checks: [
        chk(
          'c1',
          ['You cut your hand slightly. When should you report it?', 'Se cortó la mano levemente. ¿Cuándo debe reportarlo?'],
          [
            ['Only if it gets worse', 'Right away, the same shift', 'At the end of the week'],
            ['Solo si empeora', 'De inmediato, en el mismo turno', 'Al final de la semana'],
          ],
          1,
          [
            'Small injuries can become serious, and late reports are hard to investigate. Every injury is reported to your foreman during the shift it happens.',
            'Las lesiones pequeñas pueden volverse graves, y los reportes tardíos son difíciles de investigar. Toda lesión se reporta a su capataz durante el turno en que ocurre.',
          ]
        ),
      ],
    },
  },
]

const P = (en: string, es: string) => seg('s1', en, es)

/** One draft module per FR-11 section. The GC replaces the bracketed text with site facts. */
export const PROJECT_SECTION_TEMPLATE: Record<string, TemplateModule> = {
  site_hazards: {
    title: 'Site-specific hazards',
    section_key: 'site_hazards',
    content: {
      segments: [
        P(
          '[Describe the main hazards on this site: e.g. live utilities, open excavations, active traffic, adjacent operations.]',
          '[Describa los principales peligros de esta obra: p. ej. servicios activos, excavaciones abiertas, tráfico, operaciones vecinas.]'
        ),
      ],
      checks: [],
    },
  },
  emergency: {
    title: 'Emergency procedures and muster points',
    section_key: 'emergency',
    content: {
      segments: [
        P(
          '[Describe the alarm signal, evacuation routes and where the muster point is. Add a site map image.]',
          '[Describa la señal de alarma, las rutas de evacuación y dónde está el punto de reunión. Agregue un mapa de la obra.]'
        ),
      ],
      checks: [],
    },
  },
  ppe: {
    title: 'PPE requirements on this site',
    section_key: 'ppe',
    content: {
      segments: [
        P('[List PPE required on this site beyond the baseline minimum.]', '[Enumere el EPP requerido en esta obra además del mínimo básico.]'),
      ],
      checks: [],
    },
  },
  fall_protection: {
    title: 'Fall protection',
    section_key: 'fall_protection',
    content: {
      segments: [
        P(
          '[State the trigger height, required systems (guardrails, PFAS), anchor points and ladder rules on this site.]',
          '[Indique la altura de activación, los sistemas requeridos (barandas, arnés), puntos de anclaje y reglas de escaleras en esta obra.]'
        ),
      ],
      checks: [],
    },
  },
  loto: {
    title: 'Lockout / tagout',
    section_key: 'loto',
    content: {
      segments: [
        P(
          '[Explain who may apply locks, where locks and tags are issued, and what never to touch.]',
          '[Explique quién puede colocar candados, dónde se entregan candados y etiquetas, y qué nunca se debe tocar.]'
        ),
      ],
      checks: [],
    },
  },
  hot_work: {
    title: 'Hot work',
    section_key: 'hot_work',
    content: {
      segments: [
        P(
          '[Explain the hot work permit process, fire watch duration and extinguisher requirements.]',
          '[Explique el proceso de permiso de trabajo en caliente, la duración de la vigilancia de incendios y los requisitos de extintores.]'
        ),
      ],
      checks: [],
    },
  },
  confined_space: {
    title: 'Confined space',
    section_key: 'confined_space',
    content: {
      segments: [
        P(
          '[Identify permit-required confined spaces on this site and the entry permit process.]',
          '[Identifique los espacios confinados que requieren permiso en esta obra y el proceso de permiso de entrada.]'
        ),
      ],
      checks: [],
    },
  },
  incident_reporting: {
    title: 'Incident reporting on this site',
    section_key: 'incident_reporting',
    content: {
      segments: [
        P(
          '[Name who to report to on this site, the phone number, and where first aid is located.]',
          '[Indique a quién reportar en esta obra, el número de teléfono y dónde está el botiquín de primeros auxilios.]'
        ),
      ],
      checks: [],
    },
  },
  stop_work: {
    title: 'Stop-work authority on this site',
    section_key: 'stop_work',
    content: {
      segments: [
        P(
          '[Explain how to call a stop-work on this site and who to notify.]',
          '[Explique cómo detener el trabajo en esta obra y a quién notificar.]'
        ),
      ],
      checks: [],
    },
  },
}

export const ATTESTATION_STATEMENT: Record<Lang, string> = {
  en: 'I confirm that I personally completed this site orientation, that I understood the content, and that I will follow these rules on site. I know I can stop unsafe work and ask questions at any time.',
  es: 'Confirmo que completé personalmente esta orientación de la obra, que entendí el contenido y que seguiré estas reglas en la obra. Sé que puedo detener un trabajo inseguro y hacer preguntas en cualquier momento.',
}

// Worker-facing titles per language (the module's internal title stays English).
const TITLES_ES: Record<string, string> = {
  'Welcome and your safety rights': 'Bienvenida y sus derechos de seguridad',
  'Hazard awareness and housekeeping': 'Reconocimiento de peligros y orden',
  'PPE basics': 'Conceptos básicos de EPP',
  'Reporting injuries, incidents and near misses': 'Reporte de lesiones, incidentes y casi accidentes',
  'Site-specific hazards': 'Peligros específicos de la obra',
  'Emergency procedures and muster points': 'Procedimientos de emergencia y puntos de reunión',
  'PPE requirements on this site': 'Requisitos de EPP en esta obra',
  'Fall protection': 'Protección contra caídas',
  'Lockout / tagout': 'Bloqueo y etiquetado',
  'Hot work': 'Trabajo en caliente',
  'Confined space': 'Espacios confinados',
  'Incident reporting on this site': 'Reporte de incidentes en esta obra',
  'Stop-work authority on this site': 'Autoridad para detener el trabajo en esta obra',
}

for (const t of [...BASELINE_TEMPLATE, ...Object.values(PROJECT_SECTION_TEMPLATE)]) {
  ;(t.content as ModuleContent & { title?: L10n }).title = { en: t.title, es: TITLES_ES[t.title] ?? t.title }
}
