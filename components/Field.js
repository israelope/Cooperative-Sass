export default function Field({ label, name, type = 'text', required = true, hint, ...rest }) {
  return (
    <div>
      <label htmlFor={name} className="label">{label}</label>
      <input id={name} name={name} type={type} required={required} className="input" {...rest} />
      {hint && <p className="hint">{hint}</p>}
    </div>
  );
}
