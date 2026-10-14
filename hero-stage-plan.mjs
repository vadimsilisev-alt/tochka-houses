// DES-004 production plan, enabled after coordinator's DEV-003 Part B approval.
export const heroStagePlan = {
  scanHeightMultiplier: 3.2,
  transitions: [[.08, .23], [.31, .46], [.54, .69], [.77, .92]],
  note: 'Исследуем устройство дома по слоям — это не последовательность строительства',
  states: [
    { noteId: 'architecture', title: 'Архитектура', description: 'Объём, свет и связь с участком. Рассмотрите внешний облик дома.', plateau: .04 },
    { noteId: 'structure', title: 'Конструктив', description: 'Несущие стены и перекрытия. Видно, как связаны основные части дома.', plateau: .27 },
    { noteId: 'interior', title: 'Внутри дома', description: 'Помещения и инженерные маршруты. Планировка и коммуникации рассматриваются вместе.', plateau: .50, engineering: true },
    { noteId: 'ground-floor', title: 'Первый этаж', description: 'Нижний ярус без отделки и лестницы. Открытая кладка показывает расположение стен.', plateau: .73 },
    { noteId: 'foundation', title: 'Основание', description: 'Плита и грунт без надземных конструкций. Реальное основание определяется участком и расчётом.', plateau: .96 },
  ],
};
