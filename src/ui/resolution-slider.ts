import { StepSlider } from '../components/step-slider';

export type PreviewResolution = '360p' | '480p' | '720p' | 'native';

const OPTIONS = [
  { value: '360p', label: '360p', hint: 'Fast' },
  { value: '480p', label: '480p', hint: 'Balanced' },
  { value: '720p', label: '720p', hint: 'HD' },
  { value: 'native', label: 'Native', hint: 'Full RAW' },
] as const;

/** Mounts a 4-detent preview-resolution slider into `mount`. */
export function createResolutionSlider(
  mount: HTMLElement | null,
  onChange: (res: PreviewResolution) => void,
): StepSlider<PreviewResolution> | null {
  if (!mount) return null;
  const slider = new StepSlider<PreviewResolution>({
    options: [...OPTIONS],
    value: '480p',
    ariaLabel: 'Preview resolution',
    onChange,
  });
  mount.replaceChildren(slider.element);
  return slider;
}
