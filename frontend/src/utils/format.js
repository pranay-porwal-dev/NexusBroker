
export function formatCurrency(value) {
  if (value === null || value === undefined || isNaN(value)) return '₹--';
  return `₹${Number(value).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}


export function formatPnL(value){
    if(value===null || value === undefined || isNaN(value)) return '--';
    const sign = value >=0 ? '+' : '';
    return `${sign}₹${Number(Math.abs(value)).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function pnlColor(value){
    if(value>0) return 'var(--green)';
    if(value < 0) return 'var(--red)';
    return 'var(--text-muted)';
}

export function formatPercent(value){
    if(value===null || value === undefined || isNaN(value)) return '--';
    const sign = value>=0 ? '+' : '';
    return `${sign}${Number(value).toFixed(2)}%`;
}