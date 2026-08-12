package com.hungama.starme.ui.screens

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.AutoAwesome
import androidx.compose.material.icons.rounded.PlayArrow
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.hungama.starme.R
import com.hungama.starme.ui.components.CheckLine
import com.hungama.starme.ui.components.Stage
import com.hungama.starme.ui.theme.DisplayFontFamily
import com.hungama.starme.ui.theme.StarTheme

private data class FeaturedStory(val title: String, val genre: String, val image: Int)

private val featuredStories = listOf(
    FeaturedStory("Ek Love Story Aisi Bhi", "ROMANCE · SCI-FI", R.drawable.story_love_keyart),
    FeaturedStory("Hukum", "ACTION · CRIME", R.drawable.story_action_keyart),
)

@Composable
fun PromoScreen() {
    val colors = StarTheme.colors
    Stage {
        Text("FEATURED PREMIERE", color = colors.orange, style = MaterialTheme.typography.labelMedium)
        Spacer(Modifier.height(10.dp))
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(470.dp)
                .clip(RoundedCornerShape(24.dp)),
        ) {
            Image(
                painter = painterResource(R.drawable.story_love_keyart),
                contentDescription = "Ek Love Story Aisi Bhi artwork",
                contentScale = ContentScale.Crop,
                modifier = Modifier.matchParentSize(),
            )
            Box(
                Modifier.matchParentSize().background(
                    Brush.verticalGradient(
                        0f to Color.Transparent,
                        0.52f to Color(0x22000000),
                        1f to Color(0xF209090C),
                    )
                )
            )
            Column(
                modifier = Modifier.align(Alignment.BottomStart).padding(20.dp),
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(
                        modifier = Modifier
                            .size(38.dp)
                            .clip(CircleShape)
                            .background(Color.White),
                        contentAlignment = Alignment.Center,
                    ) {
                        Icon(Icons.Rounded.PlayArrow, contentDescription = "Play trailer", tint = Color.Black)
                    }
                    Text("  WATCH TRAILER", color = Color.White, fontWeight = FontWeight.Bold, fontSize = 12.sp)
                }
                Spacer(Modifier.height(14.dp))
                Text(
                    "BECOME THE\nLEAD",
                    fontFamily = DisplayFontFamily,
                    fontSize = 44.sp,
                    lineHeight = 44.sp,
                    color = Color.White,
                )
                Text(
                    "One photo. One role. Your own Micro Drama premiere.",
                    color = Color.White.copy(alpha = 0.82f),
                    style = MaterialTheme.typography.bodyMedium,
                    modifier = Modifier.padding(top = 8.dp),
                )
            }
        }

        Spacer(Modifier.height(24.dp))
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Text("Worlds Casting Now", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
            Icon(Icons.Rounded.AutoAwesome, contentDescription = null, tint = colors.gold)
        }
        Spacer(Modifier.height(12.dp))
        LazyRow(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            items(featuredStories) { story -> StoryPoster(story) }
        }

        Spacer(Modifier.height(22.dp))
        CheckLine("Native camera capture and protected identity checks")
        CheckLine("Approve your first look before the final premiere")
        CheckLine("Download episodes and share through Android")
    }
}

@Composable
private fun StoryPoster(story: FeaturedStory) {
    val colors = StarTheme.colors
    Box(
        modifier = Modifier
            .size(width = 190.dp, height = 270.dp)
            .clip(RoundedCornerShape(18.dp))
            .border(1.dp, colors.line, RoundedCornerShape(18.dp))
            .clickable { },
    ) {
        Image(
            painter = painterResource(story.image),
            contentDescription = "${story.title} poster",
            contentScale = ContentScale.Crop,
            modifier = Modifier.matchParentSize(),
        )
        Box(Modifier.matchParentSize().background(Brush.verticalGradient(listOf(Color.Transparent, Color(0xEE09090C)))))
        Column(Modifier.align(Alignment.BottomStart).padding(14.dp)) {
            Text(story.genre, color = colors.gold, fontSize = 9.sp, fontWeight = FontWeight.Bold)
            Text(story.title, color = Color.White, style = MaterialTheme.typography.titleMedium)
        }
    }
}
