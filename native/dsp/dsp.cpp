#include <cmath>
#include <cstdint>
#include <cstdlib>

static constexpr double PI = 3.141592653589793;
static constexpr double TWO_PI = PI * 2;
static constexpr double RAD_TO_INDEX = 8192 / TWO_PI;
static float sine_table[8192];

struct Filter {
  int kind;
  double sr;
  double p[5];
  double state[8];
  uint32_t rng, pos, count, capacity;
  float* history;
};

static double clamp(double x, double lo, double hi) { return x < lo ? lo : x > hi ? hi : x; }
static double soft(double x) {
  return x < -3 ? -1 : x > 3 ? 1 : (x * (27 + x * x)) / (27 + 9 * x * x);
}
static double random_value(Filter* f) {
  uint32_t x = f->rng;
  x ^= x << 13; x ^= x >> 17; x ^= x << 5;
  f->rng = x;
  return double(x) / 4294967296.0;
}

extern "C" {
int dsp_abi_version() { return 1; }
float* dsp_sine_table() { return sine_table; }
Filter* dsp_create(int kind, double sr, uint32_t seed) {
  if (kind < 1 || kind > 3 || !std::isfinite(sr) || sr < 8000 || sr > 192000 || !seed) return nullptr;
  auto* f = static_cast<Filter*>(std::calloc(1, sizeof(Filter)));
  if (!f) return nullptr;
  f->kind = kind; f->sr = sr; f->rng = seed;
  if (kind == 1) { f->p[0] = 2.5; f->p[1] = .1; f->p[2] = .4; f->p[3] = 80; f->p[4] = 8000; }
  if (kind == 2) {
    f->p[0] = .5; f->p[1] = .3; f->p[2] = .3; f->p[3] = 1;
    f->capacity = 1;
    const auto needed = static_cast<uint32_t>(std::ceil(sr * .08)) + 4;
    while (f->capacity < needed) f->capacity <<= 1;
    f->history = static_cast<float*>(std::calloc(f->capacity, sizeof(float)));
    if (!f->history) { std::free(f); return nullptr; }
  }
  if (kind == 3) { f->p[0] = 1200; f->p[1] = 2.2; f->p[2] = 1.5; }
  return f;
}
void dsp_destroy(Filter* f) { if (f) { std::free(f->history); std::free(f); } }
void dsp_reset(Filter* f) {
  for (double& x : f->state) x = 0;
  f->pos = f->count = 0;
  for (uint32_t i = 0; i < f->capacity; ++i) f->history[i] = 0;
  // init() does not reset the external random stream in the JS reference.
}
void dsp_set_params(Filter* f, const double* p) {
  if (f->kind == 1) {
    f->p[0] = clamp(p[0], 1, 10); f->p[1] = clamp(p[1], -.5, .5);
    f->p[2] = clamp(p[2], 0, 1); f->p[3] = clamp(p[3], 40, 200); f->p[4] = clamp(p[4], 1000, 18000);
  } else if (f->kind == 2) { for (int i = 0; i < 4; ++i) f->p[i] = clamp(p[i], 0, 1); }
  else { f->p[0] = clamp(p[0], 20, 18000); f->p[1] = clamp(p[1], 0, 4); f->p[2] = clamp(p[2], 1, 5); }
}
double* dsp_state(Filter* f) { return f->state; }
float* dsp_history(Filter* f) { return f->history; }
uint32_t dsp_history_length(Filter* f) { return f->capacity; }
uint32_t dsp_rng(Filter* f) { return f->rng; }
uint32_t dsp_position(Filter* f) { return f->pos; }
uint32_t dsp_noise_count(Filter* f) { return f->count; }

void dsp_process(Filter* f, float* samples, int length) {
  if (f->kind == 1) {
    const double drv = f->p[0], bias = f->p[1], zb = drv * bias;
    const double dc = soft(zb), norm = 1 / std::fmax(.2, soft(drv));
    const double bump_a = 1 - std::exp((-2 * PI * f->p[3]) / f->sr);
    const double tone_a = 1 - std::exp((-2 * PI * std::fmin(f->p[4], f->sr * .45)) / f->sr);
    double bl = f->state[0], tl = f->state[1];
    for (int i = 0; i < length; ++i) {
      const double z = drv * (double(samples[i]) + bias);
      const double z2 = z * z;
      const double tz = z < -3 ? -1 : z > 3 ? 1 : (z * (27 + z2)) / (27 + 9 * z2);
      double y = (tz - dc) * norm;
      bl += bump_a * (y - bl); y += f->p[2] * bl;
      tl += tone_a * (y - tl); samples[i] = float(tl);
    }
    f->state[0] = bl; f->state[1] = tl;
  } else if (f->kind == 2) {
    const double sr = f->sr, base = sr * .03, wow = f->p[0] * sr * .008;
    const double flutter = f->p[1] * sr * .0015, drift = f->p[2] * sr * .004;
    const double wi = (.5 / sr) * 8192, fi = (8.0 / sr) * 8192;
    const double mix = f->p[3], dry = 1 - mix, alpha = 4.0 / sr;
    const uint32_t step = static_cast<uint32_t>(std::fmax(1, std::floor(sr / 4)));
    const uint32_t mask = f->capacity - 1;
    double wp = f->state[0] * RAD_TO_INDEX, fp = f->state[1] * RAD_TO_INDEX;
    double noise = f->state[2], target = f->state[3];
    uint32_t pos = f->pos, count = f->count;
    for (int i = 0; i < length; ++i) {
      const double x = samples[i]; f->history[pos] = float(x);
      if (count <= 1) { target = random_value(f) * 2 - 1; count = step; } else --count;
      noise += (target - noise) * alpha;
      const double sw = sine_table[static_cast<int32_t>(wp) & 8191], sf = sine_table[static_cast<int32_t>(fp) & 8191];
      wp += wi; fp += fi;
      const double delay = base + wow * sw + flutter * sf + drift * noise;
      double rp = pos - delay; while (rp < 0) rp += f->capacity;
      const int32_t integer = static_cast<int32_t>(rp);
      const uint32_t i0 = integer & mask, i1 = (i0 + 1) & mask;
      const double frac = rp - integer, a = f->history[i0], b = f->history[i1];
      const double wet = a + (b - a) * frac;
      pos = (pos + 1) & mask; samples[i] = float(x * dry + wet * mix);
    }
    f->state[0] = std::fmod(wp / RAD_TO_INDEX, TWO_PI);
    f->state[1] = std::fmod(fp / RAD_TO_INDEX, TWO_PI);
    f->state[2] = noise; f->state[3] = target; f->pos = pos; f->count = count;
  } else {
    const double fc = clamp(f->p[0], 20, f->sr * .45), freq = (fc * 2.0) / f->sr;
    const double k = 3.6 * freq - 1.6 * freq * freq - 1, p = (k + 1) * .5;
    const double scale = std::exp((1 - p) * 1.386249), g = 1 - std::exp(-p * 2);
    double a = f->state[0], b = f->state[1], c = f->state[2], d = f->state[3];
    for (int i = 0; i < length; ++i) {
      const double x = double(samples[i]) * f->p[2], x0 = x - f->p[1] * d * scale, u = soft(x0);
      a += g * (soft(u) - soft(a)); b += g * (soft(a) - soft(b));
      c += g * (soft(b) - soft(c)); d += g * (soft(c) - soft(d));
      const double out = d != d ? 0 : d; samples[i] = float(clamp(out, -1, 1));
    }
    f->state[0] = a; f->state[1] = b; f->state[2] = c; f->state[3] = d;
  }
}

// One crossing per audio segment, preserving JS chunk-outer/filter-inner order.
void dsp_process_chain(Filter** filters, int count, float* samples, int length, int chunk) {
  if (count == 1) { dsp_process(filters[0], samples, length); return; }
  if (chunk <= 0) return;
  for (int offset = 0; offset < length; offset += chunk) {
    const int n = length - offset < chunk ? length - offset : chunk;
    for (int i = 0; i < count; ++i) dsp_process(filters[i], samples + offset, n);
  }
}
}
