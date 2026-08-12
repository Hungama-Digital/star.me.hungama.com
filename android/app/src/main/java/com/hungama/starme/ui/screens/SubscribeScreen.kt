package com.hungama.starme.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import com.hungama.starme.ui.components.Eyebrow
import com.hungama.starme.ui.components.ScreenHeading
import com.hungama.starme.ui.components.SmallDim
import com.hungama.starme.ui.components.Stage
import com.hungama.starme.ui.theme.DisplayFontFamily
import com.hungama.starme.ui.theme.StarTheme

@Composable
fun SubscribeScreen(welcomeCredits: Int) {
    val colors = StarTheme.colors
    Stage {
        Eyebrow("Step 1 · Membership")
        ScreenHeading("Your StarME Pass")
        Text(
            "One pass. Every story. Your face in the spotlight.",
            color = colors.dim,
            style = MaterialTheme.typography.bodyMedium,
        )
        Spacer(Modifier.height(18.dp))

        MembershipPass(welcomeCredits)

        Spacer(Modifier.height(22.dp))
        Text("YOUR PREMIERE KIT", color = colors.orange, style = MaterialTheme.typography.labelMedium)
        Spacer(Modifier.height(12.dp))
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            BenefitTile("▶", "Every Drama", "Full access", Modifier.weight(1f))
            BenefitTile("✦", "Star Credits", "$welcomeCredits ready", Modifier.weight(1f))
            BenefitTile("↻", "Free Retake", "Once per story", Modifier.weight(1f))
        }

        Spacer(Modifier.height(18.dp))
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(16.dp))
                .background(colors.surface2)
                .border(1.dp, colors.line, RoundedCornerShape(16.dp))
                .padding(15.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(
                Modifier
                    .size(10.dp)
                    .background(colors.good, CircleShape),
            )
            Text(
                "Ready instantly after secure payment",
                modifier = Modifier.padding(start = 10.dp).weight(1f),
                color = colors.text,
                style = MaterialTheme.typography.bodyMedium,
            )
        }
        Spacer(Modifier.height(12.dp))
        SmallDim("UPI, cards and major wallets accepted · Cancel anytime")
    }
}

@Composable
private fun MembershipPass(welcomeCredits: Int) {
    val colors = StarTheme.colors
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .height(242.dp)
            .clip(RoundedCornerShape(26.dp))
            .background(
                Brush.linearGradient(
                    listOf(Color(0xFF6E0C21), colors.orange, Color(0xFF28101E)),
                ),
            )
            .border(1.dp, colors.gold.copy(alpha = .55f), RoundedCornerShape(26.dp)),
    ) {
        Box(
            Modifier
                .align(Alignment.TopEnd)
                .padding(top = 18.dp, end = 20.dp)
                .size(112.dp)
                .border(18.dp, Color.White.copy(alpha = .06f), CircleShape),
        )
        Column(
            modifier = Modifier
                .matchParentSize()
                .padding(22.dp),
            verticalArrangement = Arrangement.SpaceBetween,
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.Top,
            ) {
                Column {
                    Text(
                        "STAR ME",
                        color = Color.White,
                        fontFamily = DisplayFontFamily,
                        fontSize = 32.sp,
                        letterSpacing = .03.em,
                    )
                    Text("FAST TV MEMBER", color = colors.gold, fontSize = 10.sp, fontWeight = FontWeight.Bold)
                }
                Text(
                    "ANNUAL",
                    color = Color.White,
                    fontSize = 10.sp,
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier
                        .background(Color.Black.copy(alpha = .25f), RoundedCornerShape(20.dp))
                        .padding(horizontal = 12.dp, vertical = 7.dp),
                )
            }

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.Bottom,
            ) {
                Column {
                    Text("WELCOME BALANCE", color = Color.White.copy(alpha = .7f), fontSize = 9.sp)
                    Text(
                        "$welcomeCredits CREDITS",
                        color = Color.White,
                        fontWeight = FontWeight.Bold,
                        style = MaterialTheme.typography.titleLarge,
                    )
                }
                Column(horizontalAlignment = Alignment.End) {
                    Text("₹499", color = Color.White, fontFamily = DisplayFontFamily, fontSize = 36.sp)
                    Text("PER YEAR", color = Color.White.copy(alpha = .7f), fontSize = 9.sp)
                }
            }
        }
    }
}

@Composable
private fun BenefitTile(symbol: String, title: String, value: String, modifier: Modifier = Modifier) {
    val colors = StarTheme.colors
    Column(
        modifier = modifier
            .clip(RoundedCornerShape(18.dp))
            .background(colors.surface)
            .border(1.dp, colors.line, RoundedCornerShape(18.dp))
            .padding(horizontal = 9.dp, vertical = 14.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Box(
            modifier = Modifier
                .size(42.dp)
                .background(colors.orange.copy(alpha = .16f), CircleShape),
            contentAlignment = Alignment.Center,
        ) {
            Text(symbol, color = colors.gold, fontSize = 20.sp, fontWeight = FontWeight.Bold)
        }
        Spacer(Modifier.height(10.dp))
        Text(title, color = colors.text, fontSize = 11.sp, fontWeight = FontWeight.Bold, textAlign = TextAlign.Center)
        Text(value, color = colors.dim, fontSize = 9.sp, textAlign = TextAlign.Center, maxLines = 1)
    }
}
