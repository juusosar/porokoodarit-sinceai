import { createFileRoute, Navigate } from '@tanstack/react-router';

// Keep old fitting bookmarks working without a separate blueprint screen.
export const Route = createFileRoute('/results')({
  head: () => ({ meta: [
    { title: 'Your Fitting Results | Takomo Golf' },
    { name: 'description', content: 'Compare your Takomo irons and open your saved fitting data on the results page.' },
    { property: 'og:title', content: 'Your Fitting Results | Takomo Golf' },
    { property: 'og:description', content: 'Your iron comparison and fitting data, together in one place.' },
    { property: 'og:type', content: 'website' },
    { name: 'twitter:card', content: 'summary' },
  ] }),
  component: () => <Navigate to="/clubs" replace />,
});
