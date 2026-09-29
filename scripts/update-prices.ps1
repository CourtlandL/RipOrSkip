# Pulls current TCGplayer prices from TCGCSV (https://tcgcsv.com) for every set in
# data/sets.json and writes js/data.js for the site.
#
#   ./scripts/update-prices.ps1                   update js/data.js
#   ./scripts/update-prices.ps1 -ListSealed 24269 list sealed products for a set, to fill in productIds
#
# Runs on Windows PowerShell 5.1 and PowerShell 7 (the GitHub Action uses 7).

param([int]$ListSealed)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$base = 'https://tcgcsv.com/tcgplayer/3' # 3 = Pokemon

# TCGCSV rejects PowerShell's default User-Agent, so identify the site instead.
$userAgent = 'RipOrSkip/1.0 (+https://courtlandl.github.io/RipOrSkip/)'

function Get-Json($url) {
  # Decode as UTF-8 explicitly so accented names (Pokemon, Flabebe) survive on PowerShell 5.1.
  $response = Invoke-WebRequest $url -UseBasicParsing -UserAgent $userAgent
  $text = [Text.Encoding]::UTF8.GetString($response.RawContentStream.ToArray())
  ($text | ConvertFrom-Json).results
}

function Get-Rarity($product) {
  ($product.extendedData | Where-Object name -eq 'Rarity').value
}

if ($ListSealed) {
  Get-Json "$base/$ListSealed/products" |
    Where-Object { -not (Get-Rarity $_) } |
    Sort-Object name |
    Format-Table productId, name -AutoSize
  return
}

# Market price per product. Cards prefer the Holofoil printing; sealed items only have Normal.
function Get-PriceMap($prices) {
  $map = @{}
  foreach ($p in $prices) {
    if ($null -eq $p.marketPrice) { continue }
    if ($p.subTypeName -eq 'Holofoil' -or -not $map.ContainsKey($p.productId)) {
      $map[$p.productId] = [double]$p.marketPrice
    }
  }
  $map
}

# Prices for products listed outside their set's own group (priceGroupId), fetched once per group.
$groupPriceCache = @{}
function Get-GroupPrices($groupId) {
  if (-not $groupPriceCache.ContainsKey($groupId)) {
    $groupPriceCache[$groupId] = Get-PriceMap (Get-Json "$base/$groupId/prices")
  }
  $groupPriceCache[$groupId]
}

# Sealed products with prices. Every product gets `contents` (packs by set, plus any
# guaranteed bonus cards) so the site can treat single- and multi-set products alike.
function Get-Sealed($items, $priceById, $ownerId, $label) {
  $sealed = @()
  foreach ($item in $items) {
    $map = if ($item.priceGroupId) { Get-GroupPrices $item.priceGroupId } else { $priceById }
    if (-not $map.ContainsKey($item.productId)) {
      Write-Warning "$label $($item.name): no market price, skipping"
      continue
    }
    $contents = if ($item.contents) { @($item.contents) } else { @([ordered]@{ set = $ownerId; packs = $item.packs }) }
    $product = [ordered]@{
      id = $item.id
      name = $item.name
      packs = $item.packs
      productId = $item.productId
      price = $map[$item.productId]
      contents = @($contents) # keep a one-item list as a JSON array
    }
    if ($item.kind) { $product.kind = $item.kind }
    if ($item.retail) { $product.retail = $item.retail }
    if ($item.releaseDate) { $product.releaseDate = $item.releaseDate }
    $sealed += $product
  }
  , $sealed
}

$config = Get-Content (Join-Path $root 'data/sets.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$sets = @()

# Release dates (TCGplayer's publish date per set), used to decide what's still at retail.
$releaseDates = @{}
foreach ($g in Get-Json "$base/groups") {
  $releaseDates[[int]$g.groupId] = ([datetime]$g.publishedOn).ToString('yyyy-MM-dd')
}

# Which pack slot each rarity comes from. Rarities in the same slot can't appear together
# (one card fills the slot), so the site rolls them as one draw. From TCGplayer's slot notes:
#   rare     the Rare slot: Double/Ultra Rares; in Sword & Shield every V, full art, alt art and secret
#   hit      Scarlet & Violet's second Reverse Holo slot: Illustration / Special Illustration / Hyper Rares
#   reverse  the first Reverse Holo slot: ACE SPECs and Master Ball foils
#   gallery  Sword & Shield's Trainer Gallery / Galarian Gallery slot
# Rarities not listed (Radiant Rares, Poke Ball foils, Pikachu Rares...) roll on their own.
$slotOf = @{}
foreach ($name in 'Double Rare', 'Ultra Rare', "Pok$([char]0xE9)mon V", "Pok$([char]0xE9)mon VMAX", 'VMAX / VSTAR',
  'Full Art', "Full Art Pok$([char]0xE9)mon V", 'Full Art Trainer', "Alt Art Pok$([char]0xE9)mon V", 'Alt Art VMAX',
  'Rainbow Rare', 'Gold Rare', 'Texture Energy', 'Secret Rare') { $slotOf[$name] = 'rare' }
foreach ($name in 'Illustration Rare', 'Special Illustration Rare', 'Hyper Rare', 'Mega Hyper Rare',
  'Classic Collection', 'Futuristic Rare') { $slotOf[$name] = 'hit' }
foreach ($name in 'ACE SPEC Rare', 'Master Ball Pattern') { $slotOf[$name] = 'reverse' }
foreach ($name in 'Trainer Gallery', 'Trainer Gallery V / Trainer', 'Trainer Gallery Gold VMAX',
  'Galarian Gallery', 'Galarian Gallery V / Trainer', 'Galarian Gallery Gold') { $slotOf[$name] = 'gallery' }

# Non-hit cards per pack, for the bulk value: commons, uncommons and reverse holos.
# The Rare slot adds a regular rare whenever it isn't a hit. A set can override with packLayout.
$packLayouts = @{
  'Mega Evolution'   = @{ common = 4; uncommon = 3; reverse = 2 }
  'Scarlet & Violet' = @{ common = 4; uncommon = 3; reverse = 2 }
  'Sword & Shield'   = @{ common = 4; uncommon = 3; reverse = 1 }
}

# Bulk value of one pack at market prices: typical common/uncommon (Normal printing),
# typical Reverse Holofoil of the set's commons, uncommons and rares, and a regular rare
# (Holofoil where one exists) in the share of packs whose Rare slot isn't a hit.
function Get-BulkValue($set, $products, $prices, $rareSlotHitChance) {
  $layout = if ($set.packLayout) { $set.packLayout } else { $packLayouts[$set.series] }
  if (-not $layout) { return 0 }

  $normal = @{}; $reverse = @{}; $holo = @{}
  foreach ($p in $prices) {
    if ($null -eq $p.marketPrice) { continue }
    switch ($p.subTypeName) {
      'Normal' { $normal[$p.productId] = [double]$p.marketPrice }
      'Reverse Holofoil' { $reverse[$p.productId] = [double]$p.marketPrice }
      'Holofoil' { $holo[$p.productId] = [double]$p.marketPrice }
    }
  }
  $main = @($products | Where-Object { $_.group -eq $set.groupId -and $_.name -notlike '*Ball Pattern*' })
  # Median, not mean: a few in-demand commons would otherwise inflate a typical pack's bulk.
  function Avg($items, $map) {
    $values = @($items | Where-Object { $map.ContainsKey($_.productId) } | ForEach-Object { $map[$_.productId] } | Sort-Object)
    if ($values.Count) { $values[[math]::Floor($values.Count / 2)] } else { 0 }
  }
  $commons = @($main | Where-Object { (Get-Rarity $_) -eq 'Common' })
  $uncommons = @($main | Where-Object { (Get-Rarity $_) -eq 'Uncommon' })
  $rares = @($main | Where-Object { (Get-Rarity $_) -in 'Rare', 'Holo Rare' })
  $rareValue = [math]::Max((Avg $rares $holo), (Avg $rares $normal))

  $value = [double]$layout.common * (Avg $commons $normal) +
    [double]$layout.uncommon * (Avg $uncommons $normal) +
    [double]$layout.reverse * (Avg ($commons + $uncommons + $rares) $reverse) +
    (1 - $rareSlotHitChance) * $rareValue
  [math]::Round($value, 2)
}

foreach ($set in $config.sets) {
  Write-Host "Updating $($set.name)..."
  # Some sets keep part of their pack contents in a separate TCGplayer group
  # (e.g. 30th Celebration's Classic Collection), listed in extraGroupIds.
  $products = @()
  $prices = @()
  foreach ($groupId in @($set.groupId) + @($set.extraGroupIds | Where-Object { $_ })) {
    $products += Get-Json "$base/$groupId/products" | ForEach-Object {
      $_ | Add-Member -NotePropertyName group -NotePropertyValue $groupId -PassThru
    }
    $prices += Get-Json "$base/$groupId/prices"
  }
  $priceById = Get-PriceMap $prices

  $rarities = @()
  foreach ($rate in $set.pullRates.PSObject.Properties) {
    # A rate is either a percent (cards matched by rarity) or an object:
    #   percent    percent of packs containing this tier
    #   match      product name contains this (pattern foils that share a base rarity)
    #   pattern    product name matches this regex (e.g. Sword & Shield "(Alternate Full Art)")
    #   numbers    "lo-hi" range of the card number (e.g. 204-225, or TG01-TG11 as 1-11)
    #   group      TCGplayer group the cards are in (default: the set's own group)
    #   estimated  flags a rate with no large measured study behind it
    # Tiers defined by pattern/numbers/group don't need a matching TCGplayer rarity.
    $byRarity = { (Get-Rarity $_) -eq $rate.Name -and $_.name -notlike '*Ball Pattern*' }
    $estimated = $false
    if ($rate.Value -is [PSCustomObject]) {
      $rule = $rate.Value
      $percent = [double]$rule.percent
      $estimated = [bool]$rule.estimated
      if ($rule.match) {
        $inTier = { $_.name -like "*$($rule.match)*" }
      } elseif ($rule.pattern -or $rule.numbers -or $rule.group) {
        $group = if ($rule.group) { $rule.group } else { $set.groupId }
        $lo, $hi = if ($rule.numbers) { $rule.numbers -split '-' | ForEach-Object { [int]$_ } } else { 0, [int]::MaxValue }
        $inTier = {
          $number = ($_.extendedData | Where-Object name -eq 'Number').value
          $n = if ($number -match '^\D*(\d+)') { [int]$Matches[1] } else { -1 }
          $_.group -eq $group -and $n -ge $lo -and $n -le $hi -and
            (Get-Rarity $_) -and (Get-Rarity $_) -ne 'Code Card' -and
            (-not $rule.pattern -or $_.name -cmatch $rule.pattern)
        }
      } else {
        $inTier = $byRarity
      }
    } else {
      $percent = [double]$rate.Value
      $inTier = $byRarity
    }

    $cards = @(
      $products |
        Where-Object $inTier |
        Where-Object { $priceById.ContainsKey($_.productId) } |
        ForEach-Object { [ordered]@{ name = $_.name; productId = $_.productId; price = $priceById[$_.productId] } } |
        Sort-Object { $_.price } -Descending
    )
    if ($cards.Count -eq 0) { throw "$($set.name): no priced cards found for rarity '$($rate.Name)'" }

    $avg = ($cards | ForEach-Object { $_.price } | Measure-Object -Average).Average
    $rarity = [ordered]@{
      name = $rate.Name
      perPack = $percent / 100
      avgValue = [math]::Round($avg, 2)
      cards = $cards
    }
    if ($estimated) { $rarity.estimated = $true }
    if ($slotOf.ContainsKey($rate.Name)) { $rarity.slot = $slotOf[$rate.Name] }
    $rarities += $rarity
  }

  # A slot holds one card, so its rarities' rates can't add up past 100%.
  $slotTotals = @{}
  foreach ($r in $rarities) { if ($r.slot) { $slotTotals[$r.slot] += $r.perPack } }
  foreach ($slot in $slotTotals.Keys) {
    if ($slotTotals[$slot] -gt 1) { throw "$($set.name): '$slot' slot rates add up to more than 100%" }
  }

  $bulk = Get-BulkValue $set $products $prices ([double]$slotTotals['rare'])
  $sealed = Get-Sealed $set.products $priceById $set.id $set.name

  $sets += [ordered]@{
    id = $set.id
    name = $set.name
    series = $set.series
    year = $set.year
    releaseDate = $releaseDates[[int]$set.groupId]
    note = $set.note
    pullRateSource = $set.pullRateSource
    estimateSource = $set.estimateSource
    bulkValuePerPack = $bulk
    rarities = $rarities
    products = $sealed
  }
}

# Multi-set collections: no rarities of their own; their odds come from the sets in `contents`.
foreach ($collection in $config.collections) {
  Write-Host "Updating $($collection.name)..."
  $sets += [ordered]@{
    id = $collection.id
    name = $collection.name
    series = 'Multi-set collections'
    year = $collection.year
    releaseDate = $collection.releaseDate
    rarities = @()
    products = Get-Sealed $collection.products @{} $collection.id $collection.name
  }
}

$data = [ordered]@{
  updatedAt = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
  source = 'TCGplayer market prices via TCGCSV'
  sets = $sets
}

$js = "// GENERATED by scripts/update-prices.ps1 - do not edit by hand. Edit data/sets.json instead.`n" +
      "window.RIP_DATA = " + ($data | ConvertTo-Json -Depth 10 -Compress) + ";`n"
[IO.File]::WriteAllText((Join-Path $root 'js/data.js'), $js, [Text.UTF8Encoding]::new($false))
Write-Host "Wrote js/data.js ($($sets.Count) sets)"
