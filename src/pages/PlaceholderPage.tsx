const PlaceholderPage = ({ title }: { title: string }) => (
  <div className="p-4 md:p-6">
    <h1 className="text-xl font-semibold text-foreground mb-2">{title}</h1>
    <p className="text-muted-foreground">Módulo en desarrollo.</p>
  </div>
);

export default PlaceholderPage;
