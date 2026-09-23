const Country = require("../Model/Country");

exports.getCountryByName = async (req, res) => {
  try {

    const { name } = req.params;

    const country = await Country.findOne({
      name: { $regex: `^${name}$`, $options: "i" }
    }).lean();

    if (!country) {
      return res.status(404).json({
        success: false,
        message: "Country not found"
      });
    }

    res.status(200).json({
      success: true,
      data: country
    });

  } catch (error) {

    res.status(500).json({
      success: false,
      message: error.message
    });

  }
};