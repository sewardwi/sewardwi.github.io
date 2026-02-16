const NAV_LINKS = [
  { href: '/', label: 'Home' },
  { href: '/quantum/', label: 'Quantum' },
];

function Navbar() {
  const currentPath = window.location.pathname;

  return (
    <nav className="bg-white shadow">
      <div className="max-w-4xl mx-auto px-4 py-3 flex gap-6">
        {NAV_LINKS.map(link => {
          const isActive = currentPath === link.href ||
            (link.href !== '/' && currentPath.startsWith(link.href));
          return (
            <a
              key={link.href}
              href={link.href}
              className={isActive ? 'font-semibold text-blue-600' : 'hover:text-blue-600'}
            >
              {link.label}
            </a>
          );
        })}
      </div>
    </nav>
  );
}

ReactDOM.createRoot(document.getElementById('navbar')).render(<Navbar />);
