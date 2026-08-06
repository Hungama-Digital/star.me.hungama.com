package com.hungama.starme.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import androidx.compose.ui.unit.dp
import com.hungama.starme.ui.components.Eyebrow
import com.hungama.starme.ui.components.Lead
import com.hungama.starme.ui.components.ScreenHeading
import com.hungama.starme.ui.components.SmallDim
import com.hungama.starme.ui.components.Stage
import com.hungama.starme.ui.components.StarCard
import com.hungama.starme.ui.theme.DisplayFontFamily
import com.hungama.starme.ui.theme.StarTheme

@Composable
fun SubscribeScreen(welcomeCredits: Int) {
    val colors = StarTheme.colors
    Stage {
        Eyebrow("Step 1 · Membership")
        ScreenHeading("Your debut starts with Fast TV")
        Lead("One membership unlocks the full Micro Drama universe and your StarME welcome credits.")
        StarCard {
            Row(verticalAlignment = Alignment.Bottom) {
                Text(
                    text = "₹499",
                    fontFamily = DisplayFontFamily,
                    fontWeight = FontWeight.Black,
                    fontSize = 34.sp,
                    letterSpacing = 0.02.em,
                    color = colors.text,
                )
                Text(
                    text = "per year",
                    style = MaterialTheme.typography.bodyMedium,
                    color = colors.dim,
                    modifier = Modifier.padding(start = 8.dp, bottom = 4.dp),
                )
            }
            Spacer(Modifier.height(6.dp))
            PlanRow("Fast TV · every Micro Drama", "Included")
            PlanRow("My Endings · choose your endings", "Included")
            PlanRow("StarME welcome credits", "$welcomeCredits credits", gold = true)
            PlanRow("One free re-render per drama", "Included", last = true)
        }
        Spacer(Modifier.height(10.dp))
        SmallDim("UPI, cards and all major wallets accepted. Cancel anytime.")
    }
}

@Composable
private fun PlanRow(label: String, value: String, gold: Boolean = false, last: Boolean = false) {
    val colors = StarTheme.colors
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 9.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(label, style = MaterialTheme.typography.bodyMedium, color = colors.text)
        Text(
            value,
            style = MaterialTheme.typography.bodyMedium,
            fontWeight = FontWeight.SemiBold,
            color = if (gold) colors.gold else colors.text,
        )
    }
    if (!last) {
        androidx.compose.material3.HorizontalDivider(color = colors.line.copy(alpha = 0.6f))
    }
}
