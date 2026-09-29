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

function Get-Json($url) {
  # Decode as UTF-8 explicitly so accented names (Pokemon, Flabebe) survive on PowerShell 5.1.
  $response = Invoke-WebRequest $url -UseBasicParsing
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
    $sealed += $product
  }
  , $sealed
}

$config = Get-Content (Join-Path $root 'data/sets.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$sets = @()

foreach ($set in $config.sets) {
  Write-Host "Updating $($set.name)..."
  # Some sets keep part of their pack contents in a separate TCGplayer group
  # (e.g. 30th Celebration's Classic Collection), listed in extraGroupIds.
  $products = @()
  $prices = @()
  foreach ($groupId in @($set.groupId) + @($set.extraGroupIds | Where-Object { $_ })) {
    $products += Get-Json "$base/$groupId/products"
    $prices += Get-Json "$base/$groupId/prices"
  }
  $priceById = Get-PriceMap $prices

  $rarities = @()
  foreach ($rate in $set.pullRates.PSObject.Properties) {
    # A rate is either a percent (cards matched by rarity) or {percent, match}
    # (cards matched by product name, for pattern foils that share a base rarity).
    if ($rate.Value -is [PSCustomObject]) {
      $percent = [double]$rate.Value.percent
      $match = $rate.Value.match
      $inTier = { $_.name -like "*$match*" }
    } else {
      $percent = [double]$rate.Value
      $inTier = { (Get-Rarity $_) -eq $rate.Name -and $_.name -notlike '*Ball Pattern*' }
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
    $rarities += [ordered]@{
      name = $rate.Name
      perPack = $percent / 100
      avgValue = [math]::Round($avg, 2)
      cards = $cards
    }
  }

  $sealed = Get-Sealed $set.products $priceById $set.id $set.name

  $sets += [ordered]@{
    id = $set.id
    name = $set.name
    series = $set.series
    year = $set.year
    note = $set.note
    pullRateSource = $set.pullRateSource
    bulkValuePerPack = $set.bulkValuePerPack
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
