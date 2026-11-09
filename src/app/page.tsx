import { Button } from '@/components/ui/button';
import { business } from '@/config/business';

// Temporary boot page: replaced by the real home in milestone M3.
export default function Home() {
  return (
    <main id="contenuto" className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-6 px-6">
      <p className="figures text-cream-400">{business.name}</p>
      <h1 className="display text-5xl text-cream-50">Componi la tua pizza. Noi la cuociamo.</h1>
      <div className="flex gap-3">
        <Button size="lg">Crea la tua pizza</Button>
        <Button size="lg" variant="secondary">
          Vedi i classici
        </Button>
      </div>
    </main>
  );
}
