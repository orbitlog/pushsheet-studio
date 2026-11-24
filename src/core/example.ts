import type { PushProject } from '../types';

export const exampleProjects = (): PushProject[] => [
  {
    id: 'weekend',
    name: '周末灵感',
    locales: {
      en_US: [
        { title: 'A little weekend inspiration ✨', subTitle: 'Discover something you will love.' },
        { title: 'Made for your next adventure 🏕️', subTitle: 'Your weekend starts here.' },
        { title: 'Hello, Chile 🇨🇱', subTitle: 'Explore this week’s local favorites.' },
      ],
      es_ES: [
        {
          title: 'Inspiración para tu fin de semana ✨',
          subTitle: 'Descubre algo que te encantará.',
        },
        { title: 'Tu próxima aventura te espera 🏕️', subTitle: 'El fin de semana empieza aquí.' },
        { title: 'Hola, Chile 🇨🇱', subTitle: 'Explora los favoritos de esta semana.' },
      ],
    },
  },
  {
    id: 'new-arrivals',
    name: '新品上架',
    locales: {
      en_US: [{ title: 'Fresh finds just arrived 🎁', subTitle: 'Find a new favorite today.' }],
      es_ES: [{ title: 'Llegaron las novedades 🎁', subTitle: 'Encuentra tu nuevo favorito.' }],
    },
  },
];
