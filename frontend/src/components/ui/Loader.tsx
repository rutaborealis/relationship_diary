export function Loader({ text }: { text?: string }) {
  return (
    <div className="loader-wrap">
      <div className="spinner" />
      {text && <p className="loader-text">{text}</p>}
    </div>
  );
}
