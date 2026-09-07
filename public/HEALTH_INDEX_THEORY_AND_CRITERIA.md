# PEA Cable Asset Diagnostic & Health Index (HI) Standard Operating Procedure (SOP)
## Engineering Theory, Mathematical Formulations, and Diagnostic Criteria Manual

**Document Version:** 2.4.0  
**Target Application:** PEA High-Voltage Cable Health Monitoring & Asset Tracking System  
**Standard Compliance:** IEEE Std 400.2-2013, IEC 60270, IEC 60502, CIGRE TB 728 / TB 422, IEC 60287  
**Effective Date:** 2026

---

## 1. Executive Summary & Philosophy

The **Cable Health Index (HI)** algorithm implemented in this platform is a condition-based, multi-parametric scoring model that quantifies the active degradation state of underground power cable circuits (XLPE/EPR insulation systems, accessories, and sheath earthing configurations).

Rather than relying purely on calendar age, the Health Index synthesizes:
1. **Insulation Dielectric Integrity** (Partial Discharge & Tan Delta Loss Factor)
2. **Bulk Insulation Resistivity** (DC Megohmmeter Insulation Resistance)
3. **Thermal & Loading Stress** (Surface Temperature & Infrared Thermography)
4. **Earthing & Sheath Current Dynamics** (Cross-bonding circulating ratio)

The final calculated index ranges from **$0\%$ (Imminent Failure / Severely Compromised)** to **$100\%$ (Pristine / Factory Baseline)**.

---

## 2. Multi-Parametric Mathematical Formulation

The base composite calculation uses normalized weighted parameter penalties:

$$\text{HI}_{\text{base}} = 100 - \sum_{i=1}^{n} \left( W_i \times S_i \right)$$

Where:
- $W_i$: Normalized weighting coefficient for parameter $i$, such that $\sum_{i=1}^{n} W_i = 1.00$ ($100\%$)
- $S_i$: Dimensionless severity score for parameter $i$ on a scale of $[0, 100]$:
  - $0$: Optimal, baseline condition (no penalty).
  - $100$: Worst-case critical condition (maximum penalty contribution).

---

## 3. Parameter Weight Distribution & Threshold Scoring

```
+-------------------------------------------------------------------------------+
| Diagnostic Parameter         | Weight (Wi) | Primary Standard Ref            |
+-------------------------------------------------------------------------------+
| 1. Partial Discharge (PD)    |    35%      | IEC 60270 / IEEE 400.2          |
| 2. Tan Delta (Loss Factor)   |    25%      | IEEE Std 400.2-2013             |
| 3. Insulation Resistance (IR)|    15%      | IEEE 43 / IEC 60502             |
| 4. Thermal & Surface Temp    |    15%      | IEC 60287 / CIGRE TB 728        |
| 5. Sheath Current Ratio      |    10%      | IEEE 575 / CIGRE TB 422         |
+-------------------------------------------------------------------------------+
| Total Weight                 |   100%      | Composite Health Assessment     |
+-------------------------------------------------------------------------------+
```

---

### Parameter 1: Partial Discharge (PD) Activity
- **Weight ($W_1$):** $0.35$ ($35\%$)
- **Standard Reference:** IEC 60270, IEEE 400.2
- **Degradation Physics:** Localized electrical stress concentrations in voids, delamination interfaces, or water tree tips produce micro-discharges that erode cross-linked polyethylene chains (electrical treeing), leading directly to dielectric puncture.

| Measured PD Amplitude ($Q_{\max}$) | Discharge Pattern / Mode | Severity Score ($S_1$) | Penalty Contribution ($W_1 \times S_1$) | Condition Assessment |
| :--- | :--- | :---: | :---: | :--- |
| $< 10 \text{ pC}$ | None / Background Noise | $0$ | $0.00\%$ | Pristine / Normal |
| $10 \le Q_{\max} < 50 \text{ pC}$ | Internal Void (Incipient) | $25$ | $8.75\%$ | Minor Void Discharges |
| $50 \le Q_{\max} < 250 \text{ pC}$ | Joint Interface / Slot | $60$ | $21.00\%$ | Active Electrical Treeing |
| $250 \le Q_{\max} < 1000 \text{ pC}$ | Severe Void / Treeing | $85$ | $29.75\%$ | Critical Erosion |
| $\ge 1000 \text{ pC}$ | Surface Corona / Tracking | $100$ | $35.00\%$ | Imminent Breakdown Hazard |

---

### Parameter 2: Tan Delta ($\tan \delta$) / Dielectric Loss Angle
- **Weight ($W_2$):** $0.25$ ($25\%$)
- **Standard Reference:** IEEE Std 400.2-2013 (Table 4 & 5 for VLF $0.1\text{ Hz}$ Testing)
- **Degradation Physics:** Measures the ratio of resistive (loss) current to capacitive (charging) current through the entire bulk insulation volume. High $\tan \delta$ indicates water treeing, thermal degradation of polymer chains, or severe moisture ingress into joints.

| Mean $\tan \delta$ at $U_0$ | Differential $\Delta \tan \delta$ ($1.5U_0 - 0.5U_0$) | Severity Score ($S_2$) | Penalty Contribution ($W_2 \times S_2$) | IEEE 400.2 Status |
| :--- | :--- | :---: | :---: | :--- |
| $< 1.2 \times 10^{-3}$ | $< 0.6 \times 10^{-3}$ | $0$ | $0.00\%$ | **No Action Required** (Good) |
| $1.2 \times 10^{-3} \le \text{Val} < 2.2 \times 10^{-3}$ | $0.6 \times 10^{-3} \le \text{Val} < 1.0 \times 10^{-3}$ | $40$ | $10.00\%$ | **Further Study Advised** (Moderate) |
| $\ge 2.2 \times 10^{-3}$ | $\ge 1.0 \times 10^{-3}$ | $100$ | $25.00\%$ | **Action Required** (Severe Loss) |

---

### Parameter 3: Insulation Resistance (IR)
- **Weight ($W_3$):** $0.15$ ($15\%$)
- **Standard Reference:** IEEE 43 / IEC 60502 (Tested at $2.5\text{ kV}$ / $5.0\text{ kV DC}$)
- **Degradation Physics:** Quantifies direct DC leakage current traversing the bulk volume and surface creepage path of terminations. Low insulation resistance indicates surface contamination, oil leakage in transition joints, or water ingress.

| Insulation Resistance ($R_{\text{iso}}$) | Severity Score ($S_3$) | Penalty Contribution ($W_3 \times S_3$) | Diagnostic Implication |
| :--- | :---: | :---: | :--- |
| $\ge 50 \text{ G}\Omega$ | $0$ | $0.00\%$ | High Dielectric Isolation |
| $10 \le R_{\text{iso}} < 50 \text{ G}\Omega$ | $30$ | $4.50\%$ | Minor Surface Contamination / Mild Aging |
| $1 \le R_{\text{iso}} < 10 \text{ G}\Omega$ | $70$ | $10.50\%$ | High Leakage Current / Probable Moisture |
| $< 1 \text{ G}\Omega$ | $100$ | $15.00\%$ | Critical Dielectric Failure |

---

### Parameter 4: Thermal & Surface Temperature
- **Weight ($W_4$):** $0.15$ ($15\%$)
- **Standard Reference:** IEC 60287 / CIGRE Thermal Stress Criteria
- **Degradation Physics:** Follows the Arrhenius chemical reaction rate model. Operation above continuous rated conductor temperature ($90^\circ\text{C}$ for XLPE) exponentially doubles the rate of thermal oxidation and cross-link breakdown.

| Cable Sheath / Joint Temp ($T_s$) | Temperature Rise ($\Delta T$) | Severity Score ($S_4$) | Penalty ($W_4 \times S_4$) | Thermal Status |
| :--- | :--- | :---: | :---: | :--- |
| $T_s < 50^\circ\text{C}$ | $\Delta T \le 15^\circ\text{C}$ | $0$ | $0.00\%$ | Normal Ambient / Optimal Load |
| $50^\circ\text{C} \le T_s < 70^\circ\text{C}$ | $15^\circ\text{C} < \Delta T \le 30^\circ\text{C}$ | $35$ | $5.25\%$ | Warm / Continuous High Load |
| $70^\circ\text{C} \le T_s < 90^\circ\text{C}$ | $30^\circ\text{C} < \Delta T \le 50^\circ\text{C}$ | $75$ | $11.25\%$ | Hotspot Warning / Nearing Limit |
| $T_s \ge 90^\circ\text{C}$ | $\Delta T > 50^\circ\text{C}$ | $100$ | $15.00\%$ | Critical Thermal Breakdown Risk |

---

### Parameter 5: Sheath Circulating Current Ratio
- **Weight ($W_5$):** $0.10$ ($10\%$)
- **Standard Reference:** IEEE 575 / CIGRE Working Group B1.18
- **Degradation Physics:** Defined as the ratio of Sheath Current to Phase Conductor Load Current:
  $$\text{Ratio} = \frac{I_{\text{sheath}}}{I_{\text{load}}} \times 100\%$$
  Elevated sheath current denotes accidental double earthing in single-point bonded systems, sheath voltage limiter (SVL) failure, or cross-bonding link box corrosion.

| Sheath Ratio ($I_{\text{sheath}} / I_{\text{load}}$) | Severity Score ($S_5$) | Penalty ($W_5 \times S_5$) | Condition of Earthing System |
| :--- | :---: | :---: | :--- |
| $< 10\%$ | $0$ | $0.00\%$ | Normal Cross-Bonding / Single Point |
| $10\% \le \text{Ratio} < 25\%$ | $40$ | $4.00\%$ | Moderate Sheath Circulating Current |
| $\ge 25\%$ | $100$ | $10.00\%$ | Severe Bonding Fault / Excessive Thermal Loss |

---

## 4. The Critical Override Rule (Safety Ceiling)

To prevent the "masking effect" (where 4 healthy parameters artificially elevate the score of a cable that possesses a catastrophic partial discharge void), the algorithm applies a strict **Deterministic Cap**:

$$\text{HI}_{\text{final}} = \min\left(\text{HI}_{\text{base}}, \text{Cap}_{\text{critical}}\right)$$

### Override Conditions:
1. **Severe Partial Discharge Override:**
   - If $Q_{\max} \ge 1000\text{ pC}$ OR Discharge Pattern = `Surface / Corona Tracking`
   - $\text{Cap}_{\text{critical}} = 45\%$ ($\text{HI}$ cannot exceed $45\%$).
2. **Critical Dielectric Loss Override:**
   - If IEEE 400.2 Status = `Action Required` (Tan Delta $\ge 2.2 \times 10^{-3}$)
   - $\text{Cap}_{\text{critical}} = 45\%$.
3. **Severe Thermal / Insulation Degradation Override:**
   - If $T_s \ge 90^\circ\text{C}$ OR $R_{\text{iso}} < 1\text{ G}\Omega$
   - $\text{Cap}_{\text{critical}} = 40\%$.

---

## 5. Health Index Classification Bands & Action Protocols

```
+-----------------------------------------------------------------------------------------------------+
| Health Index  | Classification | Color  | Asset Management Action Protocol                          |
+---------------+----------------+--------+-----------------------------------------------------------+
| 85% - 100%    | Good           | Green  | Normal periodic inspection cycle (every 3 to 5 years).    |
| 70% - 84%     | Moderate       | Blue   | Annual condition monitoring; trend analysis of telemetry. |
| 50% - 69%     | Caution        | Yellow | Diagnostic re-test within 6 months; pinpoint joint issues.|
| 30% - 49%     | Poor           | Orange | Plan refurbishment/replacement within 30 to 60 days.      |
|  0% - 29%     | Critical       | Red    | Immediate de-energization/load shift; emergency repair.   |
+-----------------------------------------------------------------------------------------------------+
```

---

## 6. Two-Dimensional 3×3 Risk Matrix Formulation

The total operational risk is the product of failure likelihood and failure severity:

$$\text{Risk Level} = \text{Probability of Failure (PoF)} \times \text{Consequence of Failure (CoF)}$$

### Probability of Failure (PoF) Derivation:
- **High PoF:** $\text{HI} < 50\%$ OR Critical Override Active (PD $\ge 1000\text{ pC}$, Tan Delta Action Required).
- **Medium PoF:** $50\% \le \text{HI} < 75\%$.
- **Low PoF:** $\text{HI} \ge 75\%$.

### Consequence of Failure (CoF) Derivation:
- **High CoF:**
  - High Transmission Voltage: $115\text{ kV}$ or $230\text{ kV}$.
  - Main Substation Supply / Critical Interconnector.
  - High Asset Valuation: $\text{Asset Value} > 5,000,000\text{ THB}$.
- **Medium CoF:**
  - Medium Voltage: $22\text{ kV}$ or $33\text{ kV}$ Main Trunk Feeder.
  - Moderate Asset Valuation: $1,000,000 \le \text{Asset Value} \le 5,000,000\text{ THB}$.
- **Low CoF:**
  - $22\text{ kV}$ Spur line / Radial Feeder with available backup.
  - Low Asset Valuation: $\text{Asset Value} < 1,000,000\text{ THB}$.

### 3×3 Risk Matrix Grid:
```
      ▲
      │ [High CoF]   │   Medium Risk (4)  │   High Risk (7)    │   CRITICAL RISK (9) │
C o F │ [Medium CoF] │   Low Risk (2)     │   Medium Risk (5)  │   High Risk (8)     │
      │ [Low CoF]    │   Low Risk (1)     │   Low Risk (3)     │   Medium Risk (6)   │
      └──────────────┴────────────────────┴────────────────────┴─────────────────────►
                     │     Low PoF        │    Medium PoF      │     High PoF        │
                     │  (HI >= 75%)       │ (50% <= HI < 75%)  │    (HI < 50%)       │
                                         Probability of Failure (PoF)
```

---

## 7. Google Sheets Data Mapping Reference

For all 12 regional PEA Google Sheets, the application extracts and syncs General Information from **Tab 1 ("General Information")**:

- **Column Q:** Production Month (Format: `MM/YYYY` or string)
- **Column R:** Installation Date (Format: `DD/MM/YYYY`)
- **Column S:** WBS Code
- **Column T:** Business Type
- **Column U:** Cost Center
- **Column V:** GISTAG Identifier
- **Column W:** Equipment Class
- **Column X:** Contract Number
- **Column Y:** Feeder ID
- **Column Z:** Substation ID
- **Column AA:** Operate ID
- **Column AB:** Serial Number
- **Column AC:** Equipment Model
- **Column AD:** Work Order Number
- **Column AE:** Cable Size / Cross Section (e.g. `400 sq.mm`)
- **Column AF:** Asset Value (e.g. `2,500,000 THB`)
- **Column AG:** Equipment ID (Unique Tag)
- **Column AH:** Engineering Cloud Storage QR Document Link

---

*Authored for the PEA Engineering & Asset Management Technical Review Board.*
