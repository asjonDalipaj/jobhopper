import type { Job } from '../types';

export const SAMPLE_JOBS: Job[] = [
  {
    id: 1,
    external_id: 'adyen-senior-ts',
    source: 'Adyen Careers',
    company: 'Adyen',
    title: 'Senior TypeScript & Node.js Platform Engineer',
    location: 'Amsterdam, Netherlands',
    workplace_type: 'Hybrid',
    employment_type: 'Full-time',
    url: 'https://careers.adyen.com/vacancies/senior-backend-engineer',
    description: `About the Role:
We are looking for an experienced Platform Engineer to join our Core Payment Processing team in Amsterdam. You will architect high-throughput services handling millions of transactions daily, design resilient event-driven systems, and mentor junior engineers across the team.

Key Requirements:
• 5+ years building distributed backend services in TypeScript / Node.js or Java
• Deep understanding of relational databases (PostgreSQL) and event streams (Kafka)
• Experience with low-latency APIs and strict SLA environments
• Strong communication and collaborative mindset in an international setting`,
    posted_at: '2025-02-10T10:00:00.000Z',
    tags: 'TypeScript, Node.js, Distributed Systems, Kafka, PostgreSQL',
    verdict: 'strong',
    reasoning: 'Exceptional match with your Node.js and distributed backend experience. Direct alignment with European tech stack, located in Amsterdam with hybrid flexibility.',
  },
  {
    id: 2,
    external_id: 'bol-lead-frontend',
    source: 'Bol.com Tech',
    company: 'Bol.com',
    title: 'Staff Frontend Architect (React & Performance)',
    location: 'Utrecht, Netherlands',
    workplace_type: 'Hybrid',
    employment_type: 'Full-time',
    url: 'https://careers.bol.com/positions/staff-frontend-architect',
    description: `Bol is looking for a Staff Frontend Architect to lead our web engineering standards. You will set direction for design system components, micro-frontends, core web vitals optimization, and developer tooling across 30+ cross-functional squads.

What you bring:
• Proven experience leading large-scale React architectures
• Deep expertise in modern CSS, SSR (Next.js), build tooling (Vite/Rspack)
• Passion for accessibility, performance budgets, and delightful UX micro-interactions`,
    posted_at: '2025-02-12T14:30:00.000Z',
    tags: 'React, TypeScript, Architecture, Next.js, Performance',
    verdict: 'strong',
    reasoning: 'Strong match for senior technical leadership. Meets all UI/frontend architectural criteria and aligns with EU-based tech hubs.',
  },
  {
    id: 3,
    external_id: 'jetbrains-fullstack',
    source: 'JetBrains',
    company: 'JetBrains',
    title: 'Full Stack Engineer - Cloud & Developer Tools',
    location: 'Munich, Germany',
    workplace_type: 'Remote EU',
    employment_type: 'Full-time',
    url: 'https://www.jetbrains.com/careers/jobs/full-stack-cloud-dev',
    description: `JetBrains builds developer tools used by millions of professionals worldwide. As a Full Stack Engineer on our Cloud Tools team, you will build user interfaces and scalable APIs for next-generation developer workflows.

Requirements:
• Strong foundation in modern TypeScript, React, and Kotlin or Go
• Familiarity with containerization and cloud infrastructure
• Autonomy, curiosity, and high product taste`,
    posted_at: '2025-02-11T09:15:00.000Z',
    tags: 'React, TypeScript, Kotlin, Remote EU, DevTools',
    verdict: 'fair',
    reasoning: 'Solid match on TypeScript and React. Requires some Kotlin familiarity, but high overlap on devtools and remote European flexibility.',
  },
  {
    id: 4,
    external_id: 'elastic-infra-eng',
    source: 'Elastic',
    company: 'Elastic',
    title: 'Cloud Infrastructure & SRE Engineer',
    location: 'Amsterdam / Remote EU',
    workplace_type: 'Remote',
    employment_type: 'Full-time',
    url: 'https://www.elastic.co/about/careers',
    description: `Elastic is looking for a Cloud Infrastructure Engineer to scale Elastic Cloud. You will work on Kubernetes clusters, Terraform automation, and observability pipelines across AWS, GCP, and Azure.`,
    posted_at: '2025-02-08T08:00:00.000Z',
    tags: 'Kubernetes, Go, Terraform, Cloud, SRE',
    verdict: 'weak',
    reasoning: 'Heavy SRE/Go infrastructure focus with minimal application/product software development requested in your current preferences.',
  },
  {
    id: 5,
    external_id: 'spotify-senior-web',
    source: 'Spotify',
    company: 'Spotify',
    title: 'Senior Web Engineer - Core Experience',
    location: 'Stockholm, Sweden',
    workplace_type: 'Hybrid',
    employment_type: 'Full-time',
    url: 'https://www.lifeatspotify.com/jobs/senior-web-engineer',
    description: `Join Spotify's Core Experience team building the desktop and web player used by 500M+ listeners. We value craftsmanship, responsive layouts, and lightning-fast rendering.`,
    posted_at: '2025-02-13T11:45:00.000Z',
    tags: 'React, TypeScript, WebAudio, Performance',
    verdict: 'strong',
    reasoning: 'High-craft React engineering role in Europe with great alignment on performance, web architecture, and design attention.',
  }
];
