/* ChirpKey-8 v1.0. Register-level ATtiny412 firmware, AI-assisted.
 * 3.3 V / 10 MHz. Use megaTinyCore, ATtiny412, internal 10 MHz, millis disabled.
 * Burn the 20 MHz oscillator fuse, divide by 2 at runtime, and preserve UPDI.
 * This transmits a public identifier, NOT a password or authentication secret.
 */
#include <avr/io.h>
#include <avr/interrupt.h>
#include <avr/cpufunc.h>
#include <util/delay.h>
#include <stdint.h>

#if !defined(__AVR_ATtiny412__)
#error "Select ATtiny412, not a classic ATtiny85 or another AVR."
#endif
#if F_CPU != 10000000UL
#error "ChirpKey-8 requires F_CPU=10000000UL for safe 3.3 V operation."
#endif

static constexpr uint8_t PIEZO = PIN1_bm | PIN2_bm; // package pins 4 and 5
static constexpr uint8_t LED = PIN3_bm;             // package pin 6
static constexpr uint8_t TOUCH = PIN6_bm;           // package pin 2
static constexpr uint8_t BUTTON = PIN7_bm;          // package pin 3
static constexpr uint16_t SPACE_HZ = 2400;
static constexpr uint16_t MARK_HZ = 3600;
static uint16_t baseline = 0;
static uint8_t sequence = 0, debounce = 0;
static bool armed = true, clockReady = false;

ISR(TCB0_INT_vect) {
  PORTA.OUTTGL = PIEZO; // simultaneous complementary edges, up to 6.6 Vp-p
  TCB0.INTFLAGS = TCB_CAPT_bm;
}

static void silence() {
  TCB0.CTRLA = 0;
  TCB0.INTCTRL = 0;
  TCB0.INTFLAGS = TCB_CAPT_bm;
  PORTA.OUTCLR = PIEZO; // both terminals low, no DC across the piezo
}

static void carrier(uint16_t hz) {
  const uint8_t saved = SREG;
  cli();
  TCB0.CTRLA = 0;
  TCB0.CNT = 0;
  TCB0.CCMP = (uint16_t)((F_CPU + hz) / (2UL * hz) - 1UL);
  TCB0.CTRLB = TCB_CNTMODE_INT_gc;
  TCB0.INTFLAGS = TCB_CAPT_bm;
  PORTA.OUTCLR = PIN2_bm;
  PORTA.OUTSET = PIN1_bm;
  TCB0.INTCTRL = TCB_CAPT_bm;
  TCB0.CTRLA = TCB_CLKSEL_CLKDIV1_gc | TCB_ENABLE_bm;
  SREG = saved;
}

static uint8_t crc8(uint8_t crc, uint8_t data) {
  crc ^= data;
  for (uint8_t bit = 0; bit < 8; bit++)
    crc = (crc & 0x80) ? (uint8_t)((crc << 1) ^ 0x07) : (uint8_t)(crc << 1);
  return crc; // CRC-8/SMBUS, polynomial 0x07, initial 0, no reflection
}

static void sendByte(uint8_t data) {
  // Fixed 16 ms symbols, MSB first. No UART start/stop bits.
  for (uint8_t bit = 0; bit < 8; bit++) {
    carrier((data & 0x80) ? MARK_HZ : SPACE_HZ);
    _delay_ms(16);
    data <<= 1;
  }
}

static void transmit() {
  PORTA.OUTSET = LED;
  for (uint8_t i = 0; i < 4; i++) sendByte(0x55); // acquisition preamble
  sendByte(0xD3);                               // sync, outside CRC
  const uint8_t payload[] = { 0x01, 0x08, 0x41, 0x52, sequence++ };
  uint8_t crc = 0;
  for (uint8_t i = 0; i < sizeof(payload); i++) {
    crc = crc8(crc, payload[i]);
    sendByte(payload[i]);
  }
  sendByte(crc);
  silence();
  PORTA.OUTCLR = LED;
}

static uint16_t touchSample() {
  // Discharge the covered electrode through R2, then release PA6 and time its
  // charge through the internal weak pullup. More capacitance takes longer.
  const uint8_t saved = SREG;
  cli();
  PORTA.PIN6CTRL = 0;
  PORTA.OUTCLR = TOUCH;
  PORTA.DIRSET = TOUCH;
  _delay_us(50);
  PORTA.DIRCLR = TOUCH;
  PORTA.PIN6CTRL = PORT_PULLUPEN_bm; // keep the digital input buffer enabled
  uint16_t count = 0;
  while (!(VPORTA.IN & TOUCH) && count < 512) count++;
  PORTA.PIN6CTRL = 0;
  SREG = saved;
  return count;
}

void setup() {
  cli();
  // At 3.3 V, the MCU's guaranteed speed grade is 10 MHz, not 20 MHz.
  _PROTECTED_WRITE(CLKCTRL.MCLKCTRLA, CLKCTRL_CLKSEL_OSC20M_gc);
  _PROTECTED_WRITE(CLKCTRL.MCLKCTRLB, CLKCTRL_PDIV_2X_gc | CLKCTRL_PEN_bm);
  PORTA.OUTCLR = PIEZO | LED | TOUCH;
  PORTA.DIRSET = PIEZO | LED;
  PORTA.DIRCLR = TOUCH | BUTTON;
  PORTA.PIN7CTRL = PORT_PULLUPEN_bm;
  // PA0's direction/control/fuse is deliberately untouched. UPDI stays usable.
  silence();
  clockReady = (FUSE.OSCCFG & FUSE_FREQSEL_gm) == FUSE_FREQSEL_20MHZ_gc;
  if (clockReady) {
    _delay_ms(100); // keep fingers off TP1 during the calibration window
    uint32_t sum = 0;
    for (uint8_t i = 0; i < 64; i++) { sum += touchSample(); _delay_ms(2); }
    baseline = (uint16_t)(sum / 64);
  }
  sei();
}

void loop() {
  if (!clockReady) { // Wrong oscillator fuse, do not emit incorrect FSK.
    PORTA.OUTTGL = LED;
    _delay_ms(100);
    return;
  }
  const uint16_t sample = touchSample();
  const bool touched = sample < 512 && baseline < 500 && sample > baseline + 4;
  const bool pressed = !(VPORTA.IN & BUTTON);
  if (touched || pressed) {
    if (debounce < 4) debounce++;
    if (debounce == 4 && armed) { armed = false; transmit(); }
  } else {
    if (debounce) debounce--;
    if (!debounce) armed = true;
    // Slow idle-only baseline adaptation. Never adapt while a touch is active.
    if (sample < 512 && armed) baseline = (uint16_t)((31UL * baseline + sample + 16) / 32);
  }
  _delay_ms(5); // ~20 ms debounce; touch sampling is bounded even if shorted
}

#ifdef CHIRPKEY8_STANDALONE
int main() { setup(); for (;;) loop(); }
#endif
