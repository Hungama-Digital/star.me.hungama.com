package com.hungama.starme.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
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
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import androidx.compose.ui.unit.dp
import com.hungama.starme.ui.components.CheckLine
import com.hungama.starme.ui.components.Stage
import com.hungama.starme.ui.theme.DisplayFontFamily
import com.hungama.starme.ui.theme.StarPalette
import com.hungama.starme.ui.theme.StarTheme

@Composable
fun PromoScreen() {
    val colors = StarTheme.colors
    Stage {
        HeroCard()
        Spacer(Modifier.height(14.dp))
        CheckLine("Choose a world designed for you to lead")
        CheckLine("Your face stays protected and always revocable")
        CheckLine("Approve your first look before the premiere")
    }
}

@Composable
private fun HeroCard() {
    val colors = StarTheme.colors
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(min = 430.dp)
            .clip(RoundedCornerShape(30.dp))
            .border(1.dp, colors.gold.copy(alpha = 0.28f), RoundedCornerShape(30.dp))
            .background(
                Brush.radialGradient(
                    colors = listOf(Color(0xFFFF4F6D), StarPalette.Love1, Color(0xFF09070D)),
                    center = Offset(Float.POSITIVE_INFINITY, 0f),
                    radius = 1400f,
                )
            )
            .background(
                Brush.verticalGradient(
                    0.20f to Color(0x050C0A10),
                    0.76f to Color(0xF209070D),
                )
            )
            .padding(start = 20.dp, end = 20.dp, top = 26.dp, bottom = 22.dp),
    ) {
        // Twinkle marquee
        Row(
            modifier = Modifier.align(Alignment.TopStart),
            horizontalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            repeat(5) {
                Box(
                    Modifier
                        .size(6.dp)
                        .clip(CircleShape)
                        .background(StarPalette.Gold.copy(alpha = 0.5f))
                )
            }
        }
        Column(modifier = Modifier.align(Alignment.BottomStart)) {
            Text(
                text = "YOUR NAME. ABOVE THE TITLE.",
                color = StarPalette.Gold,
                fontWeight = FontWeight.Bold,
                fontSize = 11.sp,
                letterSpacing = 0.3.em,
            )
            Spacer(Modifier.height(8.dp))
            Text(
                text = "Your face.\nYour story.\nYour premiere.",
                fontFamily = DisplayFontFamily,
                fontWeight = FontWeight.Black,
                fontSize = 46.sp,
                lineHeight = 44.sp,
                letterSpacing = 0.02.em,
                color = colors.text,
            )
            Spacer(Modifier.height(10.dp))
            Text(
                text = "Step into an original Micro Drama and see yourself as the lead, from first look to final frame.",
                color = Color(0xFFE8D9DF),
                style = MaterialTheme.typography.bodySmall,
            )
        }
    }
}
