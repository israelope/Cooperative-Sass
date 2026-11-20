import Icon from '@/components/Icon';

export default function EmptyState({
  icon = 'fileText',
  title = 'Nothing here yet',
  description,
  action,
  compact = false,
}) {
  return (
    <div className={`flex flex-col items-center justify-center px-4 text-center ${compact ? 'py-8' : 'py-12'}`}>
      <span className="mb-3 inline-flex h-11 w-11 items-center justify-center rounded-full bg-adire-50 text-adire-500">
        <Icon name={icon} size={20} />
      </span>
      <p className="font-display text-base font-semibold text-adire-900">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-ink/70">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
