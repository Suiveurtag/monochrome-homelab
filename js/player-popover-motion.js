export const PLAYER_POPOVER_OPEN = {
    duration: 380,
    easing: 'cubic-bezier(0.2, 0.9, 0.24, 1.04)',
    fill: 'both',
};

export function getPlayerPopoverFrames(panelRect, triggerRect, radius = '16px') {
    const safeTriggerRect = triggerRect || {
        left: panelRect.left + panelRect.width / 2,
        top: panelRect.top + panelRect.height,
        width: 1,
        height: 1,
    };
    return {
        collapsed: {
            opacity: 0,
            borderRadius: '999px',
            clipPath: 'inset(0 round 999px)',
            transform: `translate(${safeTriggerRect.left - panelRect.left}px, ${
                safeTriggerRect.top - panelRect.top
            }px) scale(${Math.max(0.08, safeTriggerRect.width / panelRect.width)}, ${Math.max(
                0.06,
                safeTriggerRect.height / panelRect.height
            )})`,
        },
        expanded: {
            opacity: 1,
            borderRadius: radius,
            clipPath: 'inset(0 round ' + radius + ')',
            transform: 'translate(0, 0) scale(1)',
        },
    };
}
