import { useId, useState } from 'react';

export default function PasswordInput({
  id,
  label,
  name = 'password',
  value,
  onChange,
  placeholder = 'Password',
  autoComplete = 'current-password',
  disabled = false,
  className = '',
  ...rest
}) {
  const generatedId = useId();
  const inputId = id || generatedId;
  const [showPassword, setShowPassword] = useState(false);

  const togglePasswordVisibility = (event) => {
    event.preventDefault();
    event.stopPropagation();
    setShowPassword((current) => !current);
  };

  return (
    <div className="password-input-wrap">
      {label ? (
        <label htmlFor={inputId} className="password-input-label">
          {label}
        </label>
      ) : null}

      <div className="password-input-shell">
        <input
          id={inputId}
          name={name}
          type={showPassword ? 'text' : 'password'}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          autoComplete={autoComplete}
          disabled={disabled}
          className={`password-input-field ${className}`.trim()}
          {...rest}
        />

        <button
          type="button"
          className="password-input-toggle"
          onClick={togglePasswordVisibility}
          aria-label={showPassword ? 'Sembunyikan password' : 'Tampilkan password'}
          title={showPassword ? 'Sembunyikan password' : 'Tampilkan password'}
        >
          <span aria-hidden="true">{showPassword ? '👁‍🗨' : '👁'}</span>
        </button>
      </div>
    </div>
  );
}
